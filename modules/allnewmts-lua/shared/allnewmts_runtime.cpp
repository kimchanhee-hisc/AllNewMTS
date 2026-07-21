#include "allnewmts_runtime.h"
#include "resource_bundle.h"
#include "sha256.h"

extern "C" {
#include "lauxlib.h"
#include "lua.h"
#include "lualib.h"
}

#include <algorithm>
#include <atomic>
#include <charconv>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <limits>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

constexpr size_t kAllocatorBytes = 32u * 1024u * 1024u;
constexpr size_t kCommittedBytes = 8u * 1024u * 1024u;
constexpr size_t kConfigBytes = 4u * 1024u * 1024u;
constexpr size_t kDiagnosticBytes = 64u * 1024u;
constexpr size_t kEventBytes = 256u * 1024u;
constexpr uint64_t kHookInstructions = 10000;
constexpr uint64_t kInstructionLimit = 1000000;
constexpr auto kDeadline = std::chrono::milliseconds(500);
constexpr size_t kPendingBytes = 4u * 1024u * 1024u;
constexpr size_t kPendingEvents = 64;
constexpr size_t kStageBytes = 4u * 1024u * 1024u;
constexpr size_t kStageCommands = 1024;
constexpr size_t kTokens = 32;
constexpr size_t kJsonDepth = 32;
constexpr size_t kContainerCharge = 256;

struct Json {
  enum class Kind { Null, Boolean, Number, String, Array, Object };
  Kind kind = Kind::Null;
  bool boolean = false;
  double number = 0;
  std::string string;
  std::vector<Json> array;
  std::map<std::string, Json> object;

  static Json booleanValue(bool value) { Json result; result.kind = Kind::Boolean; result.boolean = value; return result; }
  static Json numberValue(double value) { Json result; result.kind = Kind::Number; result.number = value; return result; }
  static Json stringValue(std::string value) { Json result; result.kind = Kind::String; result.string = std::move(value); return result; }
  static Json arrayValue() { Json result; result.kind = Kind::Array; return result; }
  static Json objectValue() { Json result; result.kind = Kind::Object; return result; }
};

bool validUtf8(const std::string &text) {
  size_t index = 0;
  while (index < text.size()) {
    unsigned char first = static_cast<unsigned char>(text[index++]);
    if (first < 0x80) continue;
    int remaining;
    uint32_t value;
    if ((first & 0xe0) == 0xc0) { remaining = 1; value = first & 0x1f; if (value < 2) return false; }
    else if ((first & 0xf0) == 0xe0) { remaining = 2; value = first & 0x0f; }
    else if ((first & 0xf8) == 0xf0) { remaining = 3; value = first & 0x07; }
    else return false;
    if (index + static_cast<size_t>(remaining) > text.size()) return false;
    for (int i = 0; i < remaining; ++i) {
      unsigned char next = static_cast<unsigned char>(text[index++]);
      if ((next & 0xc0) != 0x80) return false;
      value = (value << 6) | (next & 0x3f);
    }
    if ((remaining == 2 && value < 0x800) || (remaining == 3 && value < 0x10000) ||
        value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return false;
  }
  return true;
}

void appendUtf8(std::string &target, uint32_t value) {
  if (value <= 0x7f) target.push_back(static_cast<char>(value));
  else if (value <= 0x7ff) {
    target.push_back(static_cast<char>(0xc0 | (value >> 6)));
    target.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  } else if (value <= 0xffff) {
    target.push_back(static_cast<char>(0xe0 | (value >> 12)));
    target.push_back(static_cast<char>(0x80 | ((value >> 6) & 0x3f)));
    target.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  } else {
    target.push_back(static_cast<char>(0xf0 | (value >> 18)));
    target.push_back(static_cast<char>(0x80 | ((value >> 12) & 0x3f)));
    target.push_back(static_cast<char>(0x80 | ((value >> 6) & 0x3f)));
    target.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  }
}

class JsonParser {
 public:
  JsonParser(const uint8_t *bytes, size_t size) : input_(reinterpret_cast<const char *>(bytes), size) {}
  bool parse(Json &result) {
    if (!validUtf8(input_)) return false;
    skip();
    if (!value(result, 0)) return false;
    skip();
    return position_ == input_.size();
  }
 private:
  std::string input_;
  size_t position_ = 0;
  void skip() { while (position_ < input_.size() && (input_[position_] == ' ' || input_[position_] == '\n' || input_[position_] == '\r' || input_[position_] == '\t')) ++position_; }
  bool literal(const char *text) {
    size_t size = std::strlen(text);
    if (input_.compare(position_, size, text) != 0) return false;
    position_ += size;
    return true;
  }
  bool hex4(uint32_t &value) {
    value = 0;
    for (int i = 0; i < 4; ++i) {
      if (position_ >= input_.size()) return false;
      char c = input_[position_++];
      value <<= 4;
      if (c >= '0' && c <= '9') value |= static_cast<uint32_t>(c - '0');
      else if (c >= 'a' && c <= 'f') value |= static_cast<uint32_t>(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') value |= static_cast<uint32_t>(c - 'A' + 10);
      else return false;
    }
    return true;
  }
  bool string(std::string &result) {
    if (position_ >= input_.size() || input_[position_++] != '"') return false;
    result.clear();
    while (position_ < input_.size()) {
      unsigned char c = static_cast<unsigned char>(input_[position_++]);
      if (c == '"') return validUtf8(result);
      if (c < 0x20) return false;
      if (c != '\\') { result.push_back(static_cast<char>(c)); continue; }
      if (position_ >= input_.size()) return false;
      char escaped = input_[position_++];
      switch (escaped) {
        case '"': result.push_back('"'); break; case '\\': result.push_back('\\'); break;
        case '/': result.push_back('/'); break; case 'b': result.push_back('\b'); break;
        case 'f': result.push_back('\f'); break; case 'n': result.push_back('\n'); break;
        case 'r': result.push_back('\r'); break; case 't': result.push_back('\t'); break;
        case 'u': {
          uint32_t first;
          if (!hex4(first)) return false;
          if (first >= 0xd800 && first <= 0xdbff) {
            if (position_ + 2 > input_.size() || input_[position_] != '\\' || input_[position_ + 1] != 'u') return false;
            position_ += 2;
            uint32_t second;
            if (!hex4(second) || second < 0xdc00 || second > 0xdfff) return false;
            first = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
          } else if (first >= 0xdc00 && first <= 0xdfff) return false;
          appendUtf8(result, first);
          break;
        }
        default: return false;
      }
    }
    return false;
  }
  bool number(Json &result) {
    size_t start = position_;
    if (position_ < input_.size() && input_[position_] == '-') ++position_;
    if (position_ >= input_.size()) return false;
    if (input_[position_] == '0') ++position_;
    else {
      if (input_[position_] < '1' || input_[position_] > '9') return false;
      while (position_ < input_.size() && input_[position_] >= '0' && input_[position_] <= '9') ++position_;
    }
    if (position_ < input_.size() && input_[position_] == '.') {
      ++position_;
      size_t digits = position_;
      while (position_ < input_.size() && input_[position_] >= '0' && input_[position_] <= '9') ++position_;
      if (digits == position_) return false;
    }
    if (position_ < input_.size() && (input_[position_] == 'e' || input_[position_] == 'E')) {
      ++position_;
      if (position_ < input_.size() && (input_[position_] == '+' || input_[position_] == '-')) ++position_;
      size_t digits = position_;
      while (position_ < input_.size() && input_[position_] >= '0' && input_[position_] <= '9') ++position_;
      if (digits == position_) return false;
    }
    std::string token = input_.substr(start, position_ - start);
    char *end = nullptr;
    double parsed = std::strtod(token.c_str(), &end);
    if (!end || *end || !std::isfinite(parsed)) return false;
    result = Json::numberValue(parsed);
    return true;
  }
  bool value(Json &result, size_t depth) {
    if (depth > kJsonDepth || position_ >= input_.size()) return false;
    char c = input_[position_];
    if (c == 'n') { if (!literal("null")) return false; result = Json{}; return true; }
    if (c == 't') { if (!literal("true")) return false; result = Json::booleanValue(true); return true; }
    if (c == 'f') { if (!literal("false")) return false; result = Json::booleanValue(false); return true; }
    if (c == '"') { std::string parsed; if (!string(parsed)) return false; result = Json::stringValue(std::move(parsed)); return true; }
    if (c == '-' || (c >= '0' && c <= '9')) return number(result);
    if (c == '[') {
      ++position_; result = Json::arrayValue(); skip();
      if (position_ < input_.size() && input_[position_] == ']') { ++position_; return true; }
      for (;;) {
        Json child; if (!value(child, depth + 1)) return false; result.array.push_back(std::move(child)); skip();
        if (position_ >= input_.size()) return false;
        if (input_[position_] == ']') { ++position_; return true; }
        if (input_[position_++] != ',') return false; skip();
      }
    }
    if (c == '{') {
      ++position_; result = Json::objectValue(); skip();
      if (position_ < input_.size() && input_[position_] == '}') { ++position_; return true; }
      for (;;) {
        std::string key; if (!string(key)) return false; skip();
        if (position_ >= input_.size() || input_[position_++] != ':') return false; skip();
        Json child; if (!value(child, depth + 1)) return false;
        if (!result.object.emplace(std::move(key), std::move(child)).second) return false;
        skip(); if (position_ >= input_.size()) return false;
        if (input_[position_] == '}') { ++position_; return true; }
        if (input_[position_++] != ',') return false; skip();
      }
    }
    return false;
  }
};

void encodeString(std::string &output, const std::string &value) {
  static const char hex[] = "0123456789abcdef";
  output.push_back('"');
  for (unsigned char c : value) {
    switch (c) {
      case '"': output += "\\\""; break; case '\\': output += "\\\\"; break;
      case '\b': output += "\\b"; break; case '\f': output += "\\f"; break;
      case '\n': output += "\\n"; break; case '\r': output += "\\r"; break;
      case '\t': output += "\\t"; break;
      default:
        if (c < 0x20) { output += "\\u00"; output.push_back(hex[c >> 4]); output.push_back(hex[c & 15]); }
        else output.push_back(static_cast<char>(c));
    }
  }
  output.push_back('"');
}

bool encodeJson(const Json &value, std::string &output, size_t limit = std::numeric_limits<size_t>::max()) {
  if (output.size() > limit) return false;
  switch (value.kind) {
    case Json::Kind::Null: output += "null"; break;
    case Json::Kind::Boolean: output += value.boolean ? "true" : "false"; break;
    case Json::Kind::Number: {
      char buffer[64]; auto result = std::to_chars(buffer, buffer + sizeof(buffer), value.number);
      if (result.ec != std::errc()) return false; output.append(buffer, result.ptr); break;
    }
    case Json::Kind::String: encodeString(output, value.string); break;
    case Json::Kind::Array:
      output.push_back('[');
      for (size_t i = 0; i < value.array.size(); ++i) { if (i) output.push_back(','); if (!encodeJson(value.array[i], output, limit)) return false; }
      output.push_back(']'); break;
    case Json::Kind::Object:
      output.push_back('{'); {
        size_t i = 0;
        for (const auto &entry : value.object) { if (i++) output.push_back(','); encodeString(output, entry.first); output.push_back(':'); if (!encodeJson(entry.second, output, limit)) return false; }
      } output.push_back('}'); break;
  }
  return output.size() <= limit;
}

const Json *member(const Json &object, const char *name) {
  if (object.kind != Json::Kind::Object) return nullptr;
  auto found = object.object.find(name);
  return found == object.object.end() ? nullptr : &found->second;
}

bool exactKeys(const Json &object, std::initializer_list<const char *> required,
               std::initializer_list<const char *> optional = {}) {
  if (object.kind != Json::Kind::Object) return false;
  std::set<std::string> allowed;
  for (const char *key : required) { allowed.insert(key); if (!member(object, key)) return false; }
  for (const char *key : optional) allowed.insert(key);
  for (const auto &entry : object.object) if (!allowed.count(entry.first)) return false;
  return true;
}

bool boundedString(const Json *value, std::string &output, size_t limit = kEventBytes) {
  if (!value || value->kind != Json::Kind::String || value->string.size() > limit || !validUtf8(value->string)) return false;
  output = value->string;
  return true;
}

bool decimalU64(const Json *value, uint64_t &output, bool allow_zero = false) {
  if (!value || value->kind != Json::Kind::String || value->string.empty()) return false;
  if (value->string.size() > 1 && value->string[0] == '0') return false;
  uint64_t result = 0;
  auto converted = std::from_chars(value->string.data(), value->string.data() + value->string.size(), result);
  if (converted.ec != std::errc() || converted.ptr != value->string.data() + value->string.size() || (!allow_zero && result == 0)) return false;
  output = result; return true;
}

std::string decimal(uint64_t value) { return std::to_string(value); }

bool canonicalResourcePath(const std::string &path) {
  if (path.empty() || path[0] == '/' || path.find('\\') != std::string::npos || path.find('\0') != std::string::npos) return false;
  size_t start = 0;
  for (;;) {
    size_t end = path.find('/', start);
    size_t size = (end == std::string::npos ? path.size() : end) - start;
    if (size == 0 || (size == 1 && path[start] == '.') || (size == 2 && path[start] == '.' && path[start + 1] == '.')) return false;
    if (end == std::string::npos) break;
    start = end + 1;
  }
  return true;
}

bool parseHash(const std::string &text, unsigned char output[32]) {
  if (text.size() != 64) return false;
  for (size_t i = 0; i < 32; ++i) {
    auto digit = [](char c) -> int { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; return -1; };
    int high = digit(text[i * 2]), low = digit(text[i * 2 + 1]);
    if (high < 0 || low < 0) return false;
    output[i] = static_cast<unsigned char>((high << 4) | low);
  }
  return true;
}

struct Scalar {
  enum class Kind { String, Number, Boolean };
  Kind kind = Kind::String;
  std::string string;
  double number = 0;
  bool boolean = false;
};

Json scalarJson(const Scalar &value) {
  if (value.kind == Scalar::Kind::String) return Json::stringValue(value.string);
  if (value.kind == Scalar::Kind::Number) return Json::numberValue(value.number);
  return Json::booleanValue(value.boolean);
}

bool parseScalar(const Json &value, Scalar &output, bool allow_boolean = true) {
  if (!exactKeys(value, {"type", "value"})) return false;
  std::string type;
  if (!boundedString(member(value, "type"), type, 16)) return false;
  const Json *raw = member(value, "value");
  if (type == "string" && raw && raw->kind == Json::Kind::String && raw->string.size() <= kEventBytes) { output.kind = Scalar::Kind::String; output.string = raw->string; return validUtf8(output.string); }
  if (type == "number" && raw && raw->kind == Json::Kind::Number && std::isfinite(raw->number)) { output.kind = Scalar::Kind::Number; output.number = raw->number; return true; }
  if (allow_boolean && type == "boolean" && raw && raw->kind == Json::Kind::Boolean) { output.kind = Scalar::Kind::Boolean; output.boolean = raw->boolean; return true; }
  return false;
}

struct DataKey {
  std::string transaction, block, field;
  uint64_t index = 0;
  bool operator<(const DataKey &other) const { return std::tie(transaction, block, index, field) < std::tie(other.transaction, other.block, other.index, other.field); }
};
struct FieldKey {
  std::string transaction, block, field;
  bool operator<(const FieldKey &other) const { return std::tie(transaction, block, field) < std::tie(other.transaction, other.block, other.field); }
};
struct ItemKey {
  std::string code, kind, market;
  bool operator<(const ItemKey &other) const { return std::tie(code, kind, market) < std::tie(other.code, other.kind, other.market); }
};
struct ControlState { std::string type; std::map<std::string, Scalar> properties; };
struct HostState { std::map<std::string, ControlState> controls; std::map<DataKey, Scalar> data; };

struct Config {
  std::string entry_path;
  unsigned char entry_hash[32]{};
  std::string open_link;
  std::map<std::string, std::string> shared;
  std::map<ItemKey, std::string> items;
  std::map<std::string, ControlState> controls;
  std::set<FieldKey> fields;
};

bool parseConfig(const uint8_t *bytes, size_t size, Config &config, uint32_t &code) {
  code = ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;
  if (!bytes || !size || size > kConfigBytes) { if (size > kConfigBytes) code = ALLNEWMTS_RUNTIME_RESOURCE_LIMIT; return false; }
  Json root; if (!JsonParser(bytes, size).parse(root) || !exactKeys(root, {"controls", "entry", "host", "schemaVersion", "transactions"})) return false;
  const Json *version = member(root, "schemaVersion");
  if (!version || version->kind != Json::Kind::Number || version->number != 1) return false;
  const Json *entry = member(root, "entry"); std::string hash;
  if (!entry || !exactKeys(*entry, {"path", "sha256"}) || !boundedString(member(*entry, "path"), config.entry_path) ||
      !boundedString(member(*entry, "sha256"), hash, 64) || !canonicalResourcePath(config.entry_path) || !parseHash(hash, config.entry_hash)) return false;
  const AllNewMTSResource *resource = allnewmts_resource(config.entry_path.data(), config.entry_path.size());
  if (!resource) { code = ALLNEWMTS_RUNTIME_RESOURCE_NOT_FOUND; return false; }
  unsigned char actual[32]; allnewmts_sha256(resource->bytes, resource->size, actual);
  if (std::memcmp(actual, resource->sha256, 32) != 0 || std::memcmp(config.entry_hash, resource->sha256, 32) != 0) { code = ALLNEWMTS_RUNTIME_RESOURCE_HASH_MISMATCH; return false; }
  const Json *host = member(root, "host");
  if (!host || !exactKeys(*host, {"itemCodeInfo", "openLinkData", "sharedData"}) || !boundedString(member(*host, "openLinkData"), config.open_link)) return false;
  const Json *shared = member(*host, "sharedData");
  if (!shared || shared->kind != Json::Kind::Object) return false;
  for (const auto &item : shared->object) {
    if (item.first.size() > kEventBytes || item.second.kind != Json::Kind::String || item.second.string.size() > kEventBytes || !validUtf8(item.first) || !validUtf8(item.second.string)) return false;
    config.shared.emplace(item.first, item.second.string);
  }
  const Json *items = member(*host, "itemCodeInfo");
  if (!items || items->kind != Json::Kind::Array) return false;
  for (const Json &item : items->array) {
    if (!exactKeys(item, {"code", "kind", "marketLink", "value"})) return false;
    ItemKey key; std::string value;
    if (!boundedString(member(item, "code"), key.code) || !boundedString(member(item, "kind"), key.kind) ||
        !boundedString(member(item, "marketLink"), key.market) || !boundedString(member(item, "value"), value) ||
        (key.kind != "markettext" && key.kind != "exchangecode") || !config.items.emplace(std::move(key), std::move(value)).second) return false;
  }
  const Json *controls = member(root, "controls");
  if (!controls || controls->kind != Json::Kind::Array) return false;
  for (const Json &control : controls->array) {
    if (!exactKeys(control, {"id", "properties", "type"})) return false;
    std::string id, type;
    if (!boundedString(member(control, "id"), id) || !boundedString(member(control, "type"), type, 16) || (type != "Button" && type != "Edit")) return false;
    const Json *properties = member(control, "properties"); if (!properties || properties->kind != Json::Kind::Object) return false;
    ControlState state; state.type = type;
    if (type == "Button") {
      if (!exactKeys(*properties, {"border", "dfgcolor", "enabled"})) return false;
      std::string border, color; const Json *enabled = member(*properties, "enabled");
      if (!boundedString(member(*properties, "border"), border) || !boundedString(member(*properties, "dfgcolor"), color) || !enabled || enabled->kind != Json::Kind::Boolean) return false;
      Scalar a; a.kind=Scalar::Kind::String; a.string=border; state.properties["border"]=a; a.string=color; state.properties["dfgcolor"]=a;
      Scalar b; b.kind=Scalar::Kind::Boolean; b.boolean=enabled->boolean; state.properties["enabled"]=b;
    } else {
      if (!exactKeys(*properties, {"caption"})) return false;
      std::string caption; if (!boundedString(member(*properties, "caption"), caption)) return false;
      Scalar a; a.kind=Scalar::Kind::String; a.string=caption; state.properties["caption"]=a;
    }
    if (!config.controls.emplace(std::move(id), std::move(state)).second) return false;
  }
  const Json *transactions = member(root, "transactions"); if (!transactions || transactions->kind != Json::Kind::Array) return false;
  for (const Json &transaction : transactions->array) {
    if (!exactKeys(transaction, {"blocks", "id"})) return false;
    std::string transaction_id; if (!boundedString(member(transaction, "id"), transaction_id)) return false;
    const Json *blocks = member(transaction, "blocks"); if (!blocks || blocks->kind != Json::Kind::Array) return false;
    for (const Json &block : blocks->array) {
      if (!exactKeys(block, {"fields", "id"})) return false;
      std::string block_id; if (!boundedString(member(block, "id"), block_id)) return false;
      const Json *fields = member(block, "fields"); if (!fields || fields->kind != Json::Kind::Array) return false;
      for (const Json &field : fields->array) {
        if (field.kind != Json::Kind::String || field.string.size() > kEventBytes || !validUtf8(field.string) || !config.fields.insert({transaction_id, block_id, field.string}).second) return false;
      }
    }
  }
  code = ALLNEWMTS_RUNTIME_OK;
  return true;
}

enum class EventKind { Handler, Complete, Error, InternalClose };

struct ControlMutation { std::string id, property; Scalar value; };
struct Event {
  EventKind kind = EventKind::Handler;
  uint64_t base_revision = 0, revision = 0, runtime_id = 0, token = 0;
  std::string handler, transaction, error_code, error_message;
  std::vector<Scalar> arguments;
  std::vector<ControlMutation> controls;
  std::map<DataKey, Scalar> block_data;
  size_t encoded_bytes = 0;
};

bool parseIndex(const Json *value, uint64_t &output) {
  if (!value || value->kind != Json::Kind::Number || !std::isfinite(value->number) || value->number < 0 || std::floor(value->number) != value->number || value->number > 9007199254740991.0) return false;
  output = static_cast<uint64_t>(value->number); return true;
}

bool parseEvent(const uint8_t *bytes, size_t size, Event &event) {
  if (!bytes || !size || size > kEventBytes) return false;
  Json root; if (!JsonParser(bytes, size).parse(root)) return false;
  std::string kind; if (!boundedString(member(root, "kind"), kind, 32)) return false;
  const Json *version = member(root, "schemaVersion");
  if (!version || version->kind != Json::Kind::Number || version->number != 1) return false;
  if (kind == "handler") {
    if (!exactKeys(root, {"arguments", "baseRevision", "controlMutations", "handler", "kind", "schemaVersion"}) ||
        !decimalU64(member(root, "baseRevision"), event.base_revision, true) || !boundedString(member(root, "handler"), event.handler)) return false;
    const Json *arguments = member(root, "arguments"), *controls = member(root, "controlMutations");
    if (!arguments || arguments->kind != Json::Kind::Array || !controls || controls->kind != Json::Kind::Array) return false;
    for (const Json &argument : arguments->array) { Scalar value; if (!parseScalar(argument, value)) return false; event.arguments.push_back(std::move(value)); }
    for (const Json &mutation : controls->array) {
      if (!exactKeys(mutation, {"id", "property", "value"})) return false;
      ControlMutation value;
      if (!boundedString(member(mutation, "id"), value.id) || !boundedString(member(mutation, "property"), value.property, 32) ||
          !parseScalar(*member(mutation, "value"), value.value)) return false;
      event.controls.push_back(std::move(value));
    }
    event.kind = EventKind::Handler;
  } else if (kind == "transactionComplete") {
    if (!exactKeys(root, {"blockData", "kind", "requestToken", "runtimeId", "schemaVersion", "tranId"}) ||
        !decimalU64(member(root, "runtimeId"), event.runtime_id) || !decimalU64(member(root, "requestToken"), event.token) ||
        !boundedString(member(root, "tranId"), event.transaction)) return false;
    const Json *blocks = member(root, "blockData"); if (!blocks || blocks->kind != Json::Kind::Array) return false;
    for (const Json &block : blocks->array) {
      if (!exactKeys(block, {"id", "rows"})) return false;
      std::string block_id; if (!boundedString(member(block, "id"), block_id)) return false;
      const Json *rows = member(block, "rows"); if (!rows || rows->kind != Json::Kind::Array) return false;
      for (const Json &row : rows->array) {
        if (!exactKeys(row, {"index", "values"})) return false;
        uint64_t index; if (!parseIndex(member(row, "index"), index)) return false;
        const Json *values = member(row, "values"); if (!values || values->kind != Json::Kind::Object) return false;
        for (const auto &entry : values->object) {
          Scalar value; if (entry.first.size() > kEventBytes || !validUtf8(entry.first) || !parseScalar(entry.second, value, false)) return false;
          if (!event.block_data.emplace(DataKey{event.transaction, block_id, entry.first, index}, std::move(value)).second) return false;
        }
      }
    }
    event.kind = EventKind::Complete;
  } else if (kind == "transactionError") {
    if (!exactKeys(root, {"code", "kind", "message", "requestToken", "runtimeId", "schemaVersion", "tranId"}) ||
        !decimalU64(member(root, "runtimeId"), event.runtime_id) || !decimalU64(member(root, "requestToken"), event.token) ||
        !boundedString(member(root, "tranId"), event.transaction) || !boundedString(member(root, "code"), event.error_code) ||
        !boundedString(member(root, "message"), event.error_message)) return false;
    event.kind = EventKind::Error;
  } else return false;
  event.encoded_bytes = size;
  return true;
}

Json hostStateJson(const HostState &state) {
  Json result = Json::objectValue(), controls = Json::objectValue(), data = Json::objectValue();
  for (const auto &entry : state.controls) {
    Json control = Json::objectValue(), properties = Json::objectValue();
    control.object["type"] = Json::stringValue(entry.second.type);
    for (const auto &property : entry.second.properties) properties.object[property.first] = scalarJson(property.second);
    control.object["properties"] = std::move(properties); controls.object[entry.first] = std::move(control);
  }
  for (const auto &entry : state.data) {
    Json value = Json::objectValue();
    value.object["block"] = Json::stringValue(entry.first.block);
    value.object["field"] = Json::stringValue(entry.first.field);
    value.object["index"] = Json::stringValue(decimal(entry.first.index));
    value.object["transaction"] = Json::stringValue(entry.first.transaction);
    value.object["value"] = scalarJson(entry.second);
    std::string key = entry.first.transaction + "/" + entry.first.block + "/" + decimal(entry.first.index) + "/" + entry.first.field;
    data.object[key] = std::move(value);
  }
  result.object["controls"] = std::move(controls); result.object["data"] = std::move(data); return result;
}

struct Stage {
  HostState state;
  std::vector<Json> commands, diagnostics;
  std::map<uint64_t, std::string> tokens;
  size_t charged = 0;
  bool close_requested = false, duplicate_close_reported = false, in_send_before = false;
  bool charge(size_t bytes) {
    if (bytes > kStageBytes || charged > kStageBytes - bytes) return false;
    charged += bytes; return true;
  }
  bool command(Json value, size_t bytes) {
    if (commands.size() >= kStageCommands || !charge(bytes + kContainerCharge)) return false;
    commands.push_back(std::move(value)); return true;
  }
};

enum class Lifecycle { Open, Closing, Closed, Invalid };
const char *lifecycleName(Lifecycle value) {
  switch (value) { case Lifecycle::Open: return "OPEN"; case Lifecycle::Closing: return "CLOSING"; case Lifecycle::Closed: return "CLOSED"; case Lifecycle::Invalid: return "INVALID"; }
  return "INVALID";
}

class Runtime;
static char runtime_registry_key;
Runtime *runtimeFor(lua_State *state);
int runtimeDofile(lua_State *state);
int hostTrim(lua_State *state);
int hostGetOpen(lua_State *state);
int hostGetShared(lua_State *state);
int hostGetItem(lua_State *state);
int hostMessage(lua_State *state);
int hostToast(lua_State *state);
int hostReturn(lua_State *state);
int hostClose(lua_State *state);
int hostRequest(lua_State *state);
int hostSetData(lua_State *state);
int hostGetCount(lua_State *state);
int hostGetValue(lua_State *state);
int controlIndex(lua_State *state);
int controlNewIndex(lua_State *state);
int controlSetRadius(lua_State *state);

std::mutex registry_mutex;
std::map<uint64_t, std::shared_ptr<Runtime>> registry;
std::atomic<uint64_t> next_runtime_id{1}, next_token_id{1};

struct ControlRef { Runtime *runtime; const char *id; };

class Runtime : public std::enable_shared_from_this<Runtime> {
 public:
  Runtime(uint64_t id, std::vector<uint8_t> config, AllNewMTSRuntimeOutputSink sink,
          AllNewMTSRuntimeReleaseContext release, void *context)
      : id_(id), config_bytes_(std::move(config)), sink_(sink), release_(release), context_(context) {}
  ~Runtime() { if (worker_.joinable()) worker_.join(); releaseContext(); }

  uint32_t start() {
    worker_ = std::thread([this] {
      try { workerMain(); }
      catch (...) {
        closeLua();
        { std::lock_guard<std::mutex> lock(mutex_); init_code_=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT; lifecycle_=Lifecycle::Invalid; ready_=true; clearPendingLocked(); cancelTokensLocked(); }
        ready_cv_.notify_all(); releaseContext();
      }
    });
    std::unique_lock<std::mutex> lock(mutex_); ready_cv_.wait(lock, [this] { return ready_; });
    uint32_t code = init_code_; lock.unlock();
    if (code != ALLNEWMTS_RUNTIME_OK && worker_.joinable()) worker_.join();
    return code;
  }
  void takeContext() { owns_context_.store(true); }

  AllNewMTSRuntimeResult admit(Event event) {
    if (std::this_thread::get_id() == worker_id_) return {ALLNEWMTS_RUNTIME_REENTRANT_CALL, id_, 0};
    std::lock_guard<std::mutex> lock(mutex_);
    if (destroy_requested_) return {ALLNEWMTS_RUNTIME_CLOSED, id_, 0};
    if (lifecycle_ != Lifecycle::Open) {
      if (event.kind != EventKind::Handler && event.runtime_id == id_ && event.token <= canceled_token_) return {ALLNEWMTS_RUNTIME_CANCELED_CALLBACK, id_, 0};
      if (lifecycle_ == Lifecycle::Closing) return {ALLNEWMTS_RUNTIME_CLOSING, id_, 0};
      if (lifecycle_ == Lifecycle::Closed) return {ALLNEWMTS_RUNTIME_CLOSED, id_, 0};
      return {ALLNEWMTS_RUNTIME_INVALID, id_, 0};
    }
    if (queue_.size() >= kPendingEvents || event.encoded_bytes > kPendingBytes - pending_bytes_) return {ALLNEWMTS_RUNTIME_QUEUE_LIMIT, id_, 0};
    if (admission_revision_ == std::numeric_limits<uint64_t>::max()) return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT, id_, 0};
    if (event.kind == EventKind::Handler) {
      if (event.base_revision != admission_revision_) return {ALLNEWMTS_RUNTIME_STALE_REVISION, id_, 0};
    } else {
      if (event.runtime_id != id_) return {ALLNEWMTS_RUNTIME_WRONG_RUNTIME, id_, 0};
      auto found = tokens_.find(event.token);
      if (found == tokens_.end()) {
        uint32_t code = event.token <= canceled_token_ ? ALLNEWMTS_RUNTIME_CANCELED_CALLBACK :
                        event.token <= issued_token_ ? ALLNEWMTS_RUNTIME_DUPLICATE_CALLBACK : ALLNEWMTS_RUNTIME_LATE_CALLBACK;
        return {code, id_, 0};
      }
      if (found->second != event.transaction) return {ALLNEWMTS_RUNTIME_WRONG_TRANSACTION, id_, 0};
      tokens_.erase(found);
    }
    event.revision = ++admission_revision_; pending_bytes_ += event.encoded_bytes; queue_.push_back(std::move(event)); cv_.notify_one();
    return {ALLNEWMTS_RUNTIME_OK, id_, admission_revision_};
  }

  uint32_t destroy() {
    if (std::this_thread::get_id() == worker_id_) return ALLNEWMTS_RUNTIME_REENTRANT_CALL;
    {
      std::lock_guard<std::mutex> lock(mutex_); destroy_requested_ = true; clearPendingLocked(); cancelTokensLocked(); cv_.notify_one();
    }
    if (worker_.joinable()) worker_.join(); releaseContext(); return ALLNEWMTS_RUNTIME_OK;
  }

  uint64_t id() const { return id_; }
  Stage *stage() { return stage_; }
  const Config &config() const { return config_; }
  bool loading() const { return loading_; }
  bool budgetExpired() const { return timed_out_ || instruction_count_ > kInstructionLimit || std::chrono::steady_clock::now() > deadline_; }
  bool stageLimited() const { return stage_limit_; }
  void fail(const char *code) { failure_code_=code; }

  const Scalar *readData(const DataKey &key) const { auto found = stage_->state.data.find(key); return found == stage_->state.data.end() ? nullptr : &found->second; }
  const ControlState *readControl(const std::string &id) const { auto found = stage_->state.controls.find(id); return found == stage_->state.controls.end() ? nullptr : &found->second; }

  bool setData(DataKey key, Scalar value) {
    if (!config_.fields.count({key.transaction, key.block, key.field})) return false;
    size_t bytes = key.transaction.size()+key.block.size()+key.field.size()+(value.kind==Scalar::Kind::String?value.string.size():sizeof(value))+kContainerCharge;
    if (!stage_->charge(bytes)) { stage_limit_ = true; return false; }
    stage_->state.data[std::move(key)] = std::move(value); return true;
  }
  bool setControl(const std::string &id, const std::string &property, Scalar value) {
    auto found = stage_->state.controls.find(id); if (found == stage_->state.controls.end()) return false;
    bool valid = (found->second.type == "Edit" && property == "caption" && value.kind == Scalar::Kind::String) ||
                 (found->second.type == "Button" && (property == "border" || property == "dfgcolor") && value.kind == Scalar::Kind::String) ||
                 (found->second.type == "Button" && property == "enabled" && value.kind == Scalar::Kind::Boolean);
    if (!valid || !stage_->charge(id.size()+property.size()+(value.kind==Scalar::Kind::String?value.string.size():sizeof(value))+kContainerCharge)) { if (valid) stage_limit_=true; return false; }
    found->second.properties[property] = std::move(value); return true;
  }
  bool addCommand(Json command, size_t charge) { if (!stage_->command(std::move(command), charge)) { stage_limit_=true; return false; } return true; }
  void requestClose() {
    if (stage_->close_requested && !stage_->duplicate_close_reported) {
      if (!stage_->charge(sizeof("DUPLICATE_CLOSE") + kContainerCharge)) { stage_limit_=true; return; }
      Json d=Json::objectValue(); d.object["code"]=Json::stringValue("DUPLICATE_CLOSE"); d.object["source"]=Json::stringValue("runtime"); stage_->diagnostics.push_back(std::move(d)); stage_->duplicate_close_reported=true;
    }
    stage_->close_requested = true;
  }
  bool issueRequest(const std::string &transaction);

#ifdef ALLNEWMTS_RUNTIME_TESTING
  void counters(AllNewMTSRuntimeTestCounters &out) {
    std::lock_guard<std::mutex> lock(mutex_); out.allocator_current=allocated_; out.allocator_peak=peak_; out.committed_bytes=committed_bytes_;
    out.staged_bytes=stage_?stage_->charged:0; out.staged_commands=stage_?stage_->commands.size():0; out.pending_events=queue_.size(); out.pending_bytes=pending_bytes_; out.outstanding_tokens=tokens_.size();
  }
#endif

  static void *allocate(void *opaque, void *pointer, size_t old_size, size_t new_size) {
    Runtime *runtime = static_cast<Runtime *>(opaque);
    if (!new_size) { std::free(pointer); runtime->allocated_ = old_size <= runtime->allocated_ ? runtime->allocated_-old_size : 0; return nullptr; }
    if (new_size > old_size && new_size-old_size > kAllocatorBytes-runtime->allocated_) { runtime->allocation_failed_=true; return nullptr; }
    void *changed=std::realloc(pointer,new_size); if (!changed) { runtime->allocation_failed_=true; return nullptr; }
    runtime->allocated_=runtime->allocated_-old_size+new_size; runtime->peak_=std::max(runtime->peak_,runtime->allocated_); return changed;
  }
  static void hook(lua_State *state, lua_Debug *) {
    Runtime *runtime=runtimeFor(state); if (!runtime) return;
    runtime->instruction_count_ += kHookInstructions;
    if (runtime->instruction_count_ > kInstructionLimit || std::chrono::steady_clock::now() > runtime->deadline_) { runtime->timed_out_=true; luaL_error(state,"EXECUTION_TIMEOUT"); }
  }

 private:
  void releaseContext() { if (owns_context_.exchange(false) && release_) release_(context_); }
  void clearPendingLocked() { queue_.clear(); pending_bytes_=0; }
  void cancelTokensLocked() { if (!tokens_.empty()) canceled_token_=std::max(canceled_token_,tokens_.rbegin()->first); tokens_.clear(); }
  void install();
  bool loadEntry(uint32_t &code);
  bool runEvent(Event &event, bool internal);
  bool freeze(Event &event, bool ok, Lifecycle shown, const char *next, const std::vector<Json> &commands, const std::vector<Json> &diagnostics, const HostState &state, std::string &encoded);
  void deliver(const std::string &encoded) { if(sink_)sink_(context_,id_,reinterpret_cast<const uint8_t *>(encoded.data()),encoded.size()); }
  void workerMain();
  void invalidate(Event &event, const char *diagnostic, bool closing);
  bool callHandler(const char *name, const Event &event);
  void closeLua() { if (lua_) { lua_sethook(lua_,nullptr,0,0); lua_close(lua_); lua_=nullptr; } }
  void beginBudget() { allocation_failed_=false; timed_out_=false; stage_limit_=false; failure_code_=nullptr; instruction_count_=0; deadline_=std::chrono::steady_clock::now()+kDeadline; lua_sethook(lua_,hook,LUA_MASKCOUNT,static_cast<int>(kHookInstructions)); }
  void endBudget() { if (lua_) lua_sethook(lua_,nullptr,0,0); }

  uint64_t id_; std::vector<uint8_t> config_bytes_; Config config_; HostState committed_; size_t committed_bytes_=0;
  AllNewMTSRuntimeOutputSink sink_; AllNewMTSRuntimeReleaseContext release_; void *context_; std::atomic<bool> owns_context_{false};
  lua_State *lua_=nullptr; Stage *stage_=nullptr; bool loading_=true, allocation_failed_=false, timed_out_=false, stage_limit_=false;
  const char *failure_code_=nullptr;
  size_t allocated_=0,peak_=0; uint64_t instruction_count_=0; std::chrono::steady_clock::time_point deadline_;
  std::mutex mutex_; std::condition_variable cv_,ready_cv_; std::deque<Event> queue_; size_t pending_bytes_=0;
  uint64_t admission_revision_=0,published_revision_=0,issued_token_=0,canceled_token_=0; std::map<uint64_t,std::string> tokens_;
  Lifecycle lifecycle_=Lifecycle::Open; bool destroy_requested_=false,ready_=false; uint32_t init_code_=ALLNEWMTS_RUNTIME_LOAD_ERROR;
  std::thread worker_; std::thread::id worker_id_;
};

Runtime *runtimeFor(lua_State *state) {
  lua_pushlightuserdata(state, &runtime_registry_key); lua_rawget(state, LUA_REGISTRYINDEX);
  Runtime *runtime = static_cast<Runtime *>(lua_touserdata(state,-1)); lua_pop(state,1); return runtime;
}

int hostFailure(lua_State *state) { Runtime *runtime=runtimeFor(state);if(runtime)runtime->fail("HOST_ARGUMENT_ERROR");return luaL_error(state,"HOST_ARGUMENT_ERROR"); }
int lookupFailure(lua_State *state) { Runtime *runtime=runtimeFor(state);if(runtime)runtime->fail("HOST_LOOKUP_MISS");return luaL_error(state,"HOST_LOOKUP_MISS"); }
int limitFailure(lua_State *state) { Runtime *runtime=runtimeFor(state);if(runtime)runtime->fail("RESOURCE_LIMIT");return luaL_error(state,"RESOURCE_LIMIT"); }

bool readString(lua_State *state, int index, std::string &result) {
  if (lua_type(state,index) != LUA_TSTRING) return false;
  size_t size=0; const char *value=lua_tolstring(state,index,&size);
  if (!value || size>kEventBytes) return false; result.assign(value,size); return validUtf8(result);
}
bool readFinite(lua_State *state,int index,double &result) {
  if (lua_type(state,index)!=LUA_TNUMBER) return false; result=lua_tonumber(state,index); return std::isfinite(result);
}
bool readScalar(lua_State *state,int index,Scalar &result,bool boolean=false) {
  if (lua_type(state,index)==LUA_TSTRING) { result.kind=Scalar::Kind::String; return readString(state,index,result.string); }
  if (lua_type(state,index)==LUA_TNUMBER) { result.kind=Scalar::Kind::Number; return readFinite(state,index,result.number); }
  if (boolean && lua_type(state,index)==LUA_TBOOLEAN) { result.kind=Scalar::Kind::Boolean; result.boolean=lua_toboolean(state,index)!=0; return true; }
  return false;
}
void pushScalar(lua_State *state,const Scalar &value) {
  if (value.kind==Scalar::Kind::String) lua_pushlstring(state,value.string.data(),value.string.size());
  else if (value.kind==Scalar::Kind::Number) lua_pushnumber(state,value.number);
  else lua_pushboolean(state,value.boolean);
}
bool hostReady(Runtime *runtime) { return runtime && !runtime->loading() && runtime->stage() && !runtime->budgetExpired(); }

int dofileImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if (!runtime || lua_gettop(state)!=1) return -1;
  std::string path; if (!readString(state,1,path) || !canonicalResourcePath(path)) return -1;
  const AllNewMTSResource *resource=allnewmts_resource(path.data(),path.size()); if (!resource) return -2;
  unsigned char hash[32]; allnewmts_sha256(resource->bytes,resource->size,hash); if (std::memcmp(hash,resource->sha256,32)!=0) return -2;
  lua_settop(state,0); std::string chunk="@"+path;
  if (luaL_loadbuffer(state,reinterpret_cast<const char *>(resource->bytes),resource->size,chunk.c_str())!=0) return -3;
  if (lua_pcall(state,0,LUA_MULTRET,0)!=0) return -3;
  return lua_gettop(state);
}
int runtimeDofile(lua_State *state) { int result=dofileImpl(state); if (result>=0) return result; if (result==-3) return lua_error(state); return result==-2?lookupFailure(state):hostFailure(state); }

int trimImpl(lua_State *state) {
  if (lua_gettop(state)!=1) return -1; std::string value; if (!readString(state,1,value)) return -1;
  auto ws=[](unsigned char c){return c==' '||c=='\t'||c=='\r'||c=='\n'||c=='\f'||c=='\v';};
  if (!value.empty() && (ws(static_cast<unsigned char>(value.front()))||ws(static_cast<unsigned char>(value.back())))) return -1;
  lua_settop(state,0); lua_pushlstring(state,value.data(),value.size()); return 1;
}
int hostTrim(lua_State *state) { int n=trimImpl(state); return n<0?hostFailure(state):n; }

int getOpenImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if (!hostReady(runtime)||lua_gettop(state)!=0) return -1;
  const std::string &value=runtime->config().open_link; lua_pushlstring(state,value.data(),value.size()); return 1;
}
int hostGetOpen(lua_State *state) { int n=getOpenImpl(state); return n<0?hostFailure(state):n; }

int getSharedImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if (!hostReady(runtime)||lua_gettop(state)!=2||lua_type(state,2)!=LUA_TBOOLEAN||lua_toboolean(state,2)) return -1;
  std::string key; if (!readString(state,1,key)) return -1; auto found=runtime->config().shared.find(key); if(found==runtime->config().shared.end()) return -2;
  lua_settop(state,0); lua_pushlstring(state,found->second.data(),found->second.size()); return 1;
}
int hostGetShared(lua_State *state) { int n=getSharedImpl(state); return n==-2?lookupFailure(state):(n<0?hostFailure(state):n); }

int getItemImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); int n=lua_gettop(state); if(!hostReady(runtime)||(n!=2&&n!=3)) return -1;
  ItemKey key; if(!readString(state,1,key.code)||!readString(state,2,key.kind)||(key.kind!="markettext"&&key.kind!="exchangecode")) return -1;
  if(n==3&&!readString(state,3,key.market)) return -1;
  auto found=runtime->config().items.find(key); if(found==runtime->config().items.end()) return -2;
  lua_settop(state,0); lua_pushlstring(state,found->second.data(),found->second.size()); return 1;
}
int hostGetItem(lua_State *state) { int n=getItemImpl(state); return n==-2?lookupFailure(state):(n<0?hostFailure(state):n); }

int messageImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=6) return -1;
  std::string title,message,key,legacy,label; double mode;
  if(!readString(state,1,title)||!readString(state,2,message)||!readString(state,3,key)||!readString(state,4,legacy)||!legacy.empty()||!readString(state,5,label)||!readFinite(state,6,mode)||mode!=0) return -1;
  Json command=Json::objectValue(); command.object["confirmLabel"]=Json::stringValue(label); command.object["key"]=Json::stringValue(key); command.object["message"]=Json::stringValue(message); command.object["title"]=Json::stringValue(title); command.object["type"]=Json::stringValue("messageBox");
  return runtime->addCommand(std::move(command),title.size()+message.size()+key.size()+label.size())?0:-3;
}
int hostMessage(lua_State *state) { int n=messageImpl(state); return n==-3?limitFailure(state):(n<0?hostFailure(state):0); }

int toastImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=3) return -1;
  double kind,duration; std::string message; if(!readFinite(state,1,kind)||kind!=0||!readString(state,2,message)||!readFinite(state,3,duration)||duration!=1) return -1;
  Json command=Json::objectValue(); command.object["duration"]=Json::numberValue(1); command.object["kind"]=Json::numberValue(0); command.object["message"]=Json::stringValue(message); command.object["type"]=Json::stringValue("toast");
  return runtime->addCommand(std::move(command),message.size())?0:-3;
}
int hostToast(lua_State *state) { int n=toastImpl(state); return n==-3?limitFailure(state):(n<0?hostFailure(state):0); }

int returnImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=3||lua_type(state,3)!=LUA_TBOOLEAN||!lua_toboolean(state,3)) return -1;
  std::string name,payload; if(!readString(state,1,name)||!readString(state,2,payload)) return -1;
  Json command=Json::objectValue(); command.object["name"]=Json::stringValue(name); command.object["payload"]=Json::stringValue(payload); command.object["type"]=Json::stringValue("returnToParent");
  if(!runtime->addCommand(std::move(command),name.size()+payload.size())) return -3; runtime->requestClose(); return 0;
}
int hostReturn(lua_State *state) { int n=returnImpl(state); return n==-3?limitFailure(state):(n<0?hostFailure(state):0); }

int closeImpl(lua_State *state) { Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=0) return -1; runtime->requestClose(); return 0; }
int hostClose(lua_State *state) { return closeImpl(state)<0?hostFailure(state):0; }

int setDataImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=6||lua_type(state,1)!=LUA_TBOOLEAN||lua_toboolean(state,1)) return -1;
  DataKey key; double index; Scalar value;
  if(!readString(state,2,key.transaction)||!readString(state,3,key.block)||!readString(state,4,key.field)||!readFinite(state,5,index)||index<0||std::floor(index)!=index||index>9007199254740991.0||!readScalar(state,6,value)) return -1;
  key.index=static_cast<uint64_t>(index); return runtime->setData(std::move(key),std::move(value))?0:(runtime->stageLimited()?-3:-2);
}
int hostSetData(lua_State *state) { int n=setDataImpl(state); return n==-2?lookupFailure(state):(n==-3?limitFailure(state):(n<0?hostFailure(state):0)); }

int getCountImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=3||lua_type(state,1)!=LUA_TBOOLEAN||lua_toboolean(state,1)) return -1;
  std::string tran,block; if(!readString(state,2,tran)||!readString(state,3,block)) return -1;
  bool declared=false;for(const FieldKey &field:runtime->config().fields)if(field.transaction==tran&&field.block==block){declared=true;break;}if(!declared)return -2;
  uint64_t count=0; for(const auto &entry:runtime->stage()->state.data) if(entry.first.transaction==tran&&entry.first.block==block) count=std::max(count,entry.first.index+1);
  lua_settop(state,0); lua_pushnumber(state,static_cast<lua_Number>(count)); return 1;
}
int hostGetCount(lua_State *state) { int n=getCountImpl(state); return n==-2?lookupFailure(state):(n<0?hostFailure(state):n); }

int getValueImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=5||lua_type(state,1)!=LUA_TBOOLEAN||lua_toboolean(state,1)) return -1;
  DataKey key; double index; if(!readString(state,2,key.transaction)||!readString(state,3,key.block)||!readString(state,4,key.field)||!readFinite(state,5,index)||index<0||std::floor(index)!=index||index>9007199254740991.0) return -1;
  key.index=static_cast<uint64_t>(index); if(!runtime->config().fields.count({key.transaction,key.block,key.field})) return -2;
  const Scalar *value=runtime->readData(key); if(!value) return -2; lua_settop(state,0); pushScalar(state,*value); return 1;
}
int hostGetValue(lua_State *state) { int n=getValueImpl(state); return n==-2?lookupFailure(state):(n<0?hostFailure(state):n); }

int requestImpl(lua_State *state) {
  Runtime *runtime=runtimeFor(state); if(!hostReady(runtime)||lua_gettop(state)!=1) return -1; std::string transaction; if(!readString(state,1,transaction)) return -1;
  if(runtime->stage()->in_send_before) return -1; lua_settop(state,0); return runtime->issueRequest(transaction)?0:(lua_gettop(state)>0?-4:-3);
}
int hostRequest(lua_State *state) { int n=requestImpl(state); if(n==-4)return lua_error(state); return n==-3?limitFailure(state):(n<0?hostFailure(state):0); }

int controlIndexImpl(lua_State *state) {
  if(lua_gettop(state)!=2||lua_type(state,1)!=LUA_TUSERDATA) return -1; ControlRef *ref=static_cast<ControlRef *>(lua_touserdata(state,1)); if(!ref||!hostReady(ref->runtime)) return -1;
  std::string key; if(!readString(state,2,key)) return -1; const ControlState *control=ref->runtime->readControl(ref->id); if(!control) return -2;
  std::string property=key=="enable"?"enabled":key; auto found=control->properties.find(property); if(found!=control->properties.end()) { pushScalar(state,found->second); return 1; }
  if(control->type=="Button"&&key=="SetRadius") { lua_pushcfunction(state,controlSetRadius); return 1; } return -2;
}
int controlIndex(lua_State *state) { int n=controlIndexImpl(state); return n==-2?lookupFailure(state):(n<0?hostFailure(state):n); }

int controlNewIndexImpl(lua_State *state) {
  if(lua_gettop(state)!=3||lua_type(state,1)!=LUA_TUSERDATA) return -1; ControlRef *ref=static_cast<ControlRef *>(lua_touserdata(state,1)); if(!ref||!hostReady(ref->runtime)) return -1;
  std::string key; if(!readString(state,2,key)) return -1; if(key=="enable") key="enabled";
  Scalar value; bool allow=key=="enabled"; if(!readScalar(state,3,value,allow)) return -1;
  return ref->runtime->setControl(ref->id,key,std::move(value))?0:(ref->runtime->stageLimited()?-3:-2);
}
int controlNewIndex(lua_State *state) { int n=controlNewIndexImpl(state); return n==-2?lookupFailure(state):(n==-3?limitFailure(state):(n<0?hostFailure(state):0)); }

int setRadiusImpl(lua_State *state) {
  if(lua_gettop(state)!=10||lua_type(state,1)!=LUA_TUSERDATA) return -1; ControlRef *ref=static_cast<ControlRef *>(lua_touserdata(state,1)); if(!ref||!hostReady(ref->runtime)) return -1;
  const ControlState *control=ref->runtime->readControl(ref->id); if(!control||control->type!="Button") return -2;
  double first,last; std::string a,b,c,d,e,f;
  if(!readFinite(state,2,first)||!readString(state,3,a)||!readString(state,4,b)||!readString(state,5,c)||lua_type(state,6)!=LUA_TBOOLEAN||!readString(state,7,d)||!readString(state,8,e)||!readString(state,9,f)||!readFinite(state,10,last)) return -1;
  return 0;
}
int controlSetRadius(lua_State *state) { int n=setRadiusImpl(state); return n==-2?lookupFailure(state):(n<0?hostFailure(state):0); }

int denyMember(lua_State *state) { return lookupFailure(state); }
void setFunction(lua_State *state,const char *name,lua_CFunction function) { lua_pushcfunction(state,function); lua_setfield(state,-2,name); }
void clearGlobal(lua_State *state,const char *name) { lua_pushnil(state); lua_setglobal(state,name); }

void Runtime::install() {
  lua_pushlightuserdata(lua_,&runtime_registry_key); lua_pushlightuserdata(lua_,this); lua_rawset(lua_,LUA_REGISTRYINDEX);
  luaopen_base(lua_); lua_settop(lua_,0); luaopen_table(lua_); lua_settop(lua_,0); luaopen_string(lua_); lua_settop(lua_,0); luaopen_math(lua_); lua_settop(lua_,0);
  clearGlobal(lua_,"loadfile"); clearGlobal(lua_,"package"); clearGlobal(lua_,"io"); clearGlobal(lua_,"os"); clearGlobal(lua_,"debug");
  lua_pushcfunction(lua_,runtimeDofile); lua_setglobal(lua_,"dofile"); lua_pushcfunction(lua_,hostTrim); lua_setglobal(lua_,"Trim");
  lua_newtable(lua_);
  setFunction(lua_,"GetOpenLinkData",hostGetOpen); setFunction(lua_,"GetSharedData",hostGetShared); setFunction(lua_,"GetItemCodeInfo",hostGetItem);
  setFunction(lua_,"MsgBoxEx",hostMessage); setFunction(lua_,"Toast",hostToast); setFunction(lua_,"SendReturnToParent",hostReturn); setFunction(lua_,"CloseForm",hostClose);
  lua_newtable(lua_); setFunction(lua_,"__index",denyMember); setFunction(lua_,"__newindex",denyMember); lua_setmetatable(lua_,-2); lua_setglobal(lua_,"Form");
  lua_newtable(lua_); setFunction(lua_,"RequestTranData",hostRequest); setFunction(lua_,"SetDataValue",hostSetData); setFunction(lua_,"GetDataCount",hostGetCount); setFunction(lua_,"GetDataValue",hostGetValue);
  lua_newtable(lua_); setFunction(lua_,"__index",denyMember); setFunction(lua_,"__newindex",denyMember); lua_setmetatable(lua_,-2); lua_setglobal(lua_,"DATAMANAGER");
  luaL_newmetatable(lua_,"AllNewMTS.Control"); setFunction(lua_,"__index",controlIndex); setFunction(lua_,"__newindex",controlNewIndex); lua_pop(lua_,1);
  for(const auto &entry:config_.controls) {
    ControlRef *ref=static_cast<ControlRef *>(lua_newuserdata(lua_,sizeof(ControlRef))); ref->runtime=this; ref->id=entry.first.c_str();
    luaL_getmetatable(lua_,"AllNewMTS.Control"); lua_setmetatable(lua_,-2); lua_setglobal(lua_,entry.first.c_str());
  }
}

bool Runtime::loadEntry(uint32_t &code) {
  code=ALLNEWMTS_RUNTIME_LOAD_ERROR; lua_=lua_newstate(allocate,this); if(!lua_) { code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT; return false; }
  install(); const AllNewMTSResource *resource=allnewmts_resource(config_.entry_path.data(),config_.entry_path.size()); if(!resource){code=ALLNEWMTS_RUNTIME_RESOURCE_NOT_FOUND;return false;}
  unsigned char hash[32]; allnewmts_sha256(resource->bytes,resource->size,hash);
  if(std::memcmp(hash,resource->sha256,32)!=0||std::memcmp(hash,config_.entry_hash,32)!=0){code=ALLNEWMTS_RUNTIME_RESOURCE_HASH_MISMATCH;return false;}
  beginBudget(); std::string chunk="@"+config_.entry_path; int status=luaL_loadbuffer(lua_,reinterpret_cast<const char *>(resource->bytes),resource->size,chunk.c_str());
  if(!status) status=lua_pcall(lua_,0,0,0); endBudget();
  if(status) { code=(allocation_failed_||timed_out_)?ALLNEWMTS_RUNTIME_RESOURCE_LIMIT:ALLNEWMTS_RUNTIME_LOAD_ERROR; return false; }
  lua_settop(lua_,0); loading_=false; code=ALLNEWMTS_RUNTIME_OK; return true;
}

bool Runtime::callHandler(const char *name,const Event &event) {
  lua_settop(lua_,0); lua_getglobal(lua_,name);
  if(lua_isnil(lua_,-1) && event.kind==EventKind::InternalClose) { lua_settop(lua_,0); return true; }
  if(!lua_isfunction(lua_,-1)) { lua_settop(lua_,0); lua_pushliteral(lua_,"HOST_LOOKUP_MISS"); return false; }
  int arguments=0;
  if(event.kind==EventKind::Handler) { for(const Scalar &value:event.arguments){pushScalar(lua_,value);++arguments;} }
  else if(event.kind==EventKind::Complete) { lua_pushlstring(lua_,event.transaction.data(),event.transaction.size()); arguments=1; }
  else if(event.kind==EventKind::Error) {
    lua_pushlstring(lua_,event.transaction.data(),event.transaction.size()); lua_pushlstring(lua_,event.error_code.data(),event.error_code.size()); lua_pushlstring(lua_,event.error_message.data(),event.error_message.size()); arguments=3;
  }
  if(lua_pcall(lua_,arguments,0,0)!=0) return false; lua_settop(lua_,0); return !budgetExpired();
}

bool Runtime::issueRequest(const std::string &transaction) {
  if(!config_.fields.count(FieldKey{transaction,"",""})) {
    bool declared=false; for(const FieldKey &field:config_.fields) if(field.transaction==transaction){declared=true;break;} if(!declared) {fail("HOST_LOOKUP_MISS");lua_pushliteral(lua_,"HOST_LOOKUP_MISS");return false;}
  }
  {
    std::lock_guard<std::mutex> lock(mutex_); if(tokens_.size()+stage_->tokens.size()>=kTokens) { stage_limit_=true; return false; }
  }
  uint64_t token=next_token_id.fetch_add(1); if(!token) {stage_limit_=true;return false;}
  stage_->in_send_before=true; lua_getglobal(lua_,"DATAMANAGER_OnSendTranBefore");
  if(!lua_isfunction(lua_,-1)) {lua_pop(lua_,1);lua_pushliteral(lua_,"HOST_LOOKUP_MISS");stage_->in_send_before=false;return false;}
  lua_pushlstring(lua_,transaction.data(),transaction.size()); int status=lua_pcall(lua_,1,0,0); stage_->in_send_before=false; if(status||budgetExpired()) return false;
  Json command=Json::objectValue(),blocks=Json::arrayValue(); std::map<std::string,Json> grouped;
  for(const auto &entry:stage_->state.data) if(entry.first.transaction==transaction) {
    std::string blockKey=entry.first.block+"/"+decimal(entry.first.index); Json &row=grouped[blockKey];
    if(row.kind!=Json::Kind::Object){row=Json::objectValue();row.object["block"]=Json::stringValue(entry.first.block);row.object["index"]=Json::stringValue(decimal(entry.first.index));row.object["values"]=Json::objectValue();}
    row.object["values"].object[entry.first.field]=scalarJson(entry.second);
  }
  for(auto &entry:grouped) blocks.array.push_back(std::move(entry.second));
  command.object["blocks"]=std::move(blocks); command.object["requestToken"]=Json::stringValue(decimal(token)); command.object["runtimeId"]=Json::stringValue(decimal(id_)); command.object["tranId"]=Json::stringValue(transaction); command.object["type"]=Json::stringValue("requestTranData");
  if(!addCommand(std::move(command),transaction.size()+kContainerCharge)) return false; stage_->tokens[token]=transaction; issued_token_=std::max(issued_token_,token); return true;
}

bool Runtime::freeze(Event &event,bool ok,Lifecycle shown,const char *next,const std::vector<Json> &commands,const std::vector<Json> &diagnostics,const HostState &state,std::string &encoded) {
  try {
  Json root=Json::objectValue(),snapshot=Json::objectValue(),commandArray=Json::arrayValue(),diagnosticArray=Json::arrayValue();
  commandArray.array=commands; diagnosticArray.array=diagnostics;
  std::string eventName=event.kind==EventKind::Handler?event.handler:(event.kind==EventKind::Complete?"transactionComplete":(event.kind==EventKind::Error?"transactionError":"Form_OnFormClose"));
  snapshot.object["event"]=Json::stringValue(eventName); snapshot.object["lifecycle"]=Json::stringValue(lifecycleName(shown)); snapshot.object["revision"]=Json::stringValue(decimal(event.revision)); snapshot.object["runtimeId"]=Json::stringValue(decimal(id_)); snapshot.object["state"]=hostStateJson(state); snapshot.object["status"]=Json::stringValue(ok?"ok":"error");
  root.object["commands"]=std::move(commandArray); root.object["diagnostics"]=std::move(diagnosticArray); if(next)root.object["nextLifecycle"]=Json::stringValue(next); root.object["schemaVersion"]=Json::numberValue(1); root.object["snapshot"]=std::move(snapshot);
  return encodeJson(root,encoded,kCommittedBytes+kStageBytes+kDiagnosticBytes);
  } catch (...) { encoded.clear(); return false; }
}

void Runtime::invalidate(Event &event,const char *diagnostic,bool closing) {
  Json command=Json::objectValue(); command.object["code"]=Json::stringValue(diagnostic); command.object["type"]=Json::stringValue("runtimeError");
  Json detail=Json::objectValue(); detail.object["code"]=Json::stringValue(diagnostic); detail.object["event"]=Json::stringValue(event.kind==EventKind::Handler?event.handler:"runtime"); detail.object["source"]=Json::stringValue("supervisor");
  std::vector<Json> commands{std::move(command)},diagnostics{std::move(detail)};
  if(closing) { Json close=Json::objectValue();close.object["type"]=Json::stringValue("closeForm");commands.push_back(std::move(close)); }
  std::string encoded;if(freeze(event,false,closing?Lifecycle::Closing:Lifecycle::Open,"INVALID",commands,diagnostics,committed_,encoded))deliver(encoded);
  { std::lock_guard<std::mutex> lock(mutex_); lifecycle_=Lifecycle::Invalid; clearPendingLocked(); cancelTokensLocked(); }
  closeLua(); releaseContext();
}

bool Runtime::runEvent(Event &event,bool internal) {
  Stage stage; stage.state=committed_; stage_=&stage; beginBudget();
  bool ok=true;
  if(event.kind==EventKind::Handler) {
    for(const ControlMutation &mutation:event.controls) {
      Scalar value=mutation.value; if(mutation.property!="caption"||!setControl(mutation.id,mutation.property,std::move(value))) {ok=false;break;}
    }
  } else if(event.kind==EventKind::Complete) {
    for(auto it=stage.state.data.begin();it!=stage.state.data.end();) { if(it->first.transaction==event.transaction)it=stage.state.data.erase(it);else ++it; }
    for(const auto &entry:event.block_data) { if(!setData(entry.first,entry.second)){ok=false;break;} }
  }
  const char *handler=event.kind==EventKind::Handler?event.handler.c_str():(event.kind==EventKind::Complete?"DATAMANAGER_OnReceiveTranComplete":(event.kind==EventKind::Error?"DATAMANAGER_OnReceiveTranError":"Form_OnFormClose"));
  if(ok) ok=callHandler(handler,event); endBudget();
  if(!ok||allocation_failed_||timed_out_||stage_limit_) {
    const char *code=timed_out_?"EXECUTION_TIMEOUT":((allocation_failed_||stage_limit_)?"RESOURCE_LIMIT":(failure_code_?failure_code_:"LUA_ERROR")); stage_=nullptr; invalidate(event,code,internal); return false;
  }
  Json serialized=hostStateJson(stage.state); std::string bytes; if(!encodeJson(serialized,bytes,kCommittedBytes)) {stage_=nullptr;invalidate(event,"RESOURCE_LIMIT",internal);return false;}
  if(internal) {
    Json close=Json::objectValue(); close.object["type"]=Json::stringValue("closeForm"); stage.commands.push_back(std::move(close));
    std::string output;if(!freeze(event,true,Lifecycle::Closing,"CLOSED",stage.commands,stage.diagnostics,stage.state,output)){stage_=nullptr;invalidate(event,"RESOURCE_LIMIT",true);return false;}
    committed_=std::move(stage.state); committed_bytes_=bytes.size();
    {std::lock_guard<std::mutex> lock(mutex_);for(const auto &token:stage.tokens)tokens_[token.first]=token.second;published_revision_=event.revision;}
    deliver(output);
    {std::lock_guard<std::mutex> lock(mutex_);lifecycle_=Lifecycle::Closed;clearPendingLocked();cancelTokensLocked();}
    stage_=nullptr;closeLua();releaseContext();return true;
  }
  const char *next=stage.close_requested?"CLOSING":nullptr;
  std::string output;if(!freeze(event,true,Lifecycle::Open,next,stage.commands,stage.diagnostics,stage.state,output)){stage_=nullptr;invalidate(event,"RESOURCE_LIMIT",false);return false;}
  committed_=std::move(stage.state); committed_bytes_=bytes.size();
  {std::lock_guard<std::mutex> lock(mutex_);for(const auto &token:stage.tokens)tokens_[token.first]=token.second;published_revision_=event.revision;}
  deliver(output);
  if(stage.close_requested) {std::lock_guard<std::mutex> lock(mutex_);lifecycle_=Lifecycle::Closing;clearPendingLocked();cancelTokensLocked();admission_revision_=event.revision;}
  stage_=nullptr; return true;
}

void Runtime::workerMain() {
  worker_id_=std::this_thread::get_id(); uint32_t code=ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;
  if(parseConfig(config_bytes_.data(),config_bytes_.size(),config_,code)) {
    committed_.controls=config_.controls; std::string encoded; Json initial=hostStateJson(committed_);
    if(!encodeJson(initial,encoded,kCommittedBytes)) code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;
    else {committed_bytes_=encoded.size();loadEntry(code);}
  }
  config_bytes_.clear(); config_bytes_.shrink_to_fit();
  {std::lock_guard<std::mutex> lock(mutex_);init_code_=code;ready_=true;} ready_cv_.notify_one();
  if(code!=ALLNEWMTS_RUNTIME_OK){closeLua();return;}
  for(;;) {
    Event event;
    {
      std::unique_lock<std::mutex> lock(mutex_); cv_.wait(lock,[this]{return destroy_requested_||!queue_.empty()||lifecycle_!=Lifecycle::Open;});
      if(lifecycle_==Lifecycle::Closing) { event.kind=EventKind::InternalClose;event.revision=++admission_revision_; }
      else if(!queue_.empty()) {event=std::move(queue_.front());pending_bytes_-=event.encoded_bytes;queue_.pop_front();}
      else if(destroy_requested_||lifecycle_==Lifecycle::Closed||lifecycle_==Lifecycle::Invalid) break;
      else continue;
    }
    bool internal=event.kind==EventKind::InternalClose;
    try { runEvent(event,internal); }
    catch (...) { stage_=nullptr;invalidate(event,"RESOURCE_LIMIT",internal); }
    std::lock_guard<std::mutex> lock(mutex_); if(destroy_requested_&&lifecycle_==Lifecycle::Open) break; if(lifecycle_==Lifecycle::Closed||lifecycle_==Lifecycle::Invalid) break;
  }
  closeLua();
}

}  // namespace

extern "C" AllNewMTSRuntimeResult allnewmts_runtime_create(const uint8_t *config_json,size_t config_json_size,AllNewMTSRuntimeOutputSink sink,AllNewMTSRuntimeReleaseContext release_context,void *context) {
  try {
  if(!config_json||!config_json_size||config_json_size>kConfigBytes||!sink||!release_context) return {config_json_size>kConfigBytes?ALLNEWMTS_RUNTIME_RESOURCE_LIMIT:ALLNEWMTS_RUNTIME_INVALID_ARGUMENT,0,0};
  uint64_t id=next_runtime_id.fetch_add(1); if(!id)return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,0,0};
  std::vector<uint8_t> bytes(config_json,config_json+config_json_size); auto runtime=std::make_shared<Runtime>(id,std::move(bytes),sink,release_context,context);
  uint32_t code=runtime->start(); if(code!=ALLNEWMTS_RUNTIME_OK)return {code,0,0};
  try { std::lock_guard<std::mutex> lock(registry_mutex);registry[id]=runtime; }
  catch (...) { runtime->destroy(); return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,0,0}; }
  runtime->takeContext(); return {ALLNEWMTS_RUNTIME_OK,id,0};
  } catch (...) { return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,0,0}; }
}

extern "C" AllNewMTSRuntimeResult allnewmts_runtime_dispatch(uint64_t runtime_id,const uint8_t *event_json,size_t event_json_size) {
  try {
  Event event; if(!parseEvent(event_json,event_json_size,event))return {event_json_size>kEventBytes?ALLNEWMTS_RUNTIME_RESOURCE_LIMIT:ALLNEWMTS_RUNTIME_INVALID_ARGUMENT,runtime_id,0};
  std::shared_ptr<Runtime> runtime; {std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return {ALLNEWMTS_RUNTIME_NOT_FOUND,runtime_id,0};runtime=found->second;}
  return runtime->admit(std::move(event));
  } catch (...) { return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,runtime_id,0}; }
}

extern "C" AllNewMTSRuntimeResult allnewmts_runtime_destroy(uint64_t runtime_id) {
  try {
  std::shared_ptr<Runtime> runtime; {std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return {ALLNEWMTS_RUNTIME_NOT_FOUND,runtime_id,0};runtime=found->second;registry.erase(found);}
  uint32_t code=runtime->destroy(); return {code,runtime_id,0};
  } catch (...) { return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,runtime_id,0}; }
}

extern "C" const char *allnewmts_runtime_result_name(uint32_t code) {
  static const char *names[]={"OK","INVALID_ARGUMENT","RESOURCE_LIMIT","RESOURCE_NOT_FOUND","RESOURCE_HASH_MISMATCH","LOAD_ERROR","NOT_FOUND","CLOSING","CLOSED","INVALID","STALE_REVISION","QUEUE_LIMIT","WRONG_RUNTIME","WRONG_TRANSACTION","DUPLICATE_CALLBACK","LATE_CALLBACK","CANCELED_CALLBACK","REENTRANT_CALL"};
  return code<sizeof(names)/sizeof(names[0])?names[code]:"UNKNOWN";
}

#ifdef ALLNEWMTS_RUNTIME_TESTING
extern "C" int allnewmts_runtime_test_counters(uint64_t runtime_id,AllNewMTSRuntimeTestCounters *counters) {
  if(!counters)return 0;std::shared_ptr<Runtime> runtime;{std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return 0;runtime=found->second;}runtime->counters(*counters);return 1;
}
#endif

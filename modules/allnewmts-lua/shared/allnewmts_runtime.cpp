#include "allnewmts_runtime.h"
#include "allnewmts_runtime_lua.h"
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
#include <functional>
#include <iterator>
#include <limits>
#include <map>
#include <memory>
#include <mutex>
#include <new>
#include <set>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace {

constexpr size_t kAllocatorBytes = 32u * 1024u * 1024u;
constexpr size_t kCommittedBytes = 8u * 1024u * 1024u;
constexpr size_t kConfigBytes = 4u * 1024u * 1024u;
constexpr size_t kDiagnosticBytes = 64u * 1024u;
constexpr size_t kEventBytes = 256u * 1024u;
constexpr uint64_t kHookInstructions = 1;
constexpr uint64_t kInstructionLimit = 1000000;
constexpr auto kDeadline = std::chrono::milliseconds(500);
constexpr size_t kPendingBytes = 4u * 1024u * 1024u;
constexpr size_t kPendingEvents = 64;
constexpr size_t kStageBytes = 4u * 1024u * 1024u;
constexpr size_t kStageCommands = 1024;
constexpr size_t kTokens = 32;
constexpr size_t kJsonDepth = 32;
constexpr size_t kContainerCharge = 256;

struct ArenaBudget {
  size_t charged = 0;
  bool failed = false;
  bool charge(size_t bytes) {
    if (bytes > kConfigBytes || charged > kConfigBytes - bytes) { failed=true; return false; }
    charged += bytes;
    return true;
  }
};

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

bool validUtf8(std::string_view text) {
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
  JsonParser(const uint8_t *bytes, size_t size, ArenaBudget *arena = nullptr)
      : input_(reinterpret_cast<const char *>(bytes), size), arena_(arena) {}
  bool parse(Json &result) {
    if (!validUtf8(input_)) return false;
    skip();
    if (!value(result, 0)) return false;
    skip();
    return position_ == input_.size();
  }
 private:
  std::string_view input_;
  ArenaBudget *arena_;
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
      if (c == '"') return validUtf8(result) && (!arena_ || arena_->charge(result.size()));
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
    std::string token(input_.substr(start, position_ - start));
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
      ++position_; if(arena_&&!arena_->charge(kContainerCharge))return false; result = Json::arrayValue(); skip();
      if (position_ < input_.size() && input_[position_] == ']') { ++position_; return true; }
      for (;;) {
        Json child; if (!value(child, depth + 1) || (arena_&&!arena_->charge(kContainerCharge))) return false; result.array.push_back(std::move(child)); skip();
        if (position_ >= input_.size()) return false;
        if (input_[position_] == ']') { ++position_; return true; }
        if (input_[position_++] != ',') return false; skip();
      }
    }
    if (c == '{') {
      ++position_; if(arena_&&!arena_->charge(kContainerCharge))return false; result = Json::objectValue(); skip();
      if (position_ < input_.size() && input_[position_] == '}') { ++position_; return true; }
      for (;;) {
        std::string key; if (!string(key)) return false; skip();
        if (position_ >= input_.size() || input_[position_++] != ':') return false; skip();
        Json child; if (!value(child, depth + 1) || (arena_&&!arena_->charge(kContainerCharge))) return false;
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

bool imageResource(const std::string &value) {
  return value.size() <= 2048 && std::none_of(value.begin(), value.end(), [](unsigned char byte) {
    return byte <= 0x1f || byte == 0x7f;
  });
}

bool boundedInteger(const Json *value, double minimum, double maximum) {
  return value && value->kind == Json::Kind::Number && std::isfinite(value->number) &&
         std::floor(value->number) == value->number && value->number >= minimum && value->number <= maximum;
}

bool identifierString(const Json *value, std::string &output,
                      size_t limit = kEventBytes) {
  return boundedString(value, output, limit) && !output.empty() &&
         output.find('\0') == std::string::npos;
}

bool reservedGlobal(const std::string &name) {
  static const std::set<std::string> names = {
      "_G","_VERSION","Form","DATAMANAGER","Trim","dofile","loadfile",
      "package","io","os","debug","coroutine","table","string","math",
      "assert","collectgarbage","error","getfenv","getmetatable","ipairs",
      "load","loadstring","next","pairs","pcall","print","rawequal",
      "rawget","rawset","select","setfenv","setmetatable","tonumber",
      "tostring","type","unpack","xpcall"};
  return names.count(name) != 0;
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
size_t decimalDigits(uint64_t value) {
  size_t digits = 1;
  while (value >= 10) { value /= 10; ++digits; }
  return digits;
}

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

bool parseConfig(const uint8_t *bytes, size_t size, Config &config, uint32_t &code,
                 ArenaBudget &arena) {
  code = ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;
  if (!bytes || !size || size > kConfigBytes) { if (size > kConfigBytes) code = ALLNEWMTS_RUNTIME_RESOURCE_LIMIT; return false; }
  Json root; if (!JsonParser(bytes, size, &arena).parse(root) || !exactKeys(root, {"controls", "entry", "host", "schemaVersion", "transactions"})) { if(arena.failed)code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT; return false; }
  const Json *version = member(root, "schemaVersion");
  if (!version || version->kind != Json::Kind::Number || version->number != 1) return false;
  const Json *entry = member(root, "entry"); std::string hash;
  if (!entry || !exactKeys(*entry, {"path", "sha256"}) || !identifierString(member(*entry, "path"), config.entry_path) ||
      !boundedString(member(*entry, "sha256"), hash, 64) || !canonicalResourcePath(config.entry_path) || !parseHash(hash, config.entry_hash)) return false;
  if(!arena.charge(config.entry_path.size()+hash.size()+kContainerCharge)){code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;return false;}
  const AllNewMTSResource *resource = allnewmts_resource(config.entry_path.data(), config.entry_path.size());
  if (!resource) { code = ALLNEWMTS_RUNTIME_RESOURCE_NOT_FOUND; return false; }
  unsigned char actual[32]; allnewmts_sha256(resource->bytes, resource->size, actual);
  if (std::memcmp(actual, resource->sha256, 32) != 0 || std::memcmp(config.entry_hash, resource->sha256, 32) != 0) { code = ALLNEWMTS_RUNTIME_RESOURCE_HASH_MISMATCH; return false; }
  const Json *host = member(root, "host");
  if (!host || !exactKeys(*host, {"itemCodeInfo", "openLinkData", "sharedData"}) || !boundedString(member(*host, "openLinkData"), config.open_link)) return false;
  if(!arena.charge(config.open_link.size()+kContainerCharge)){code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;return false;}
  const Json *shared = member(*host, "sharedData");
  if (!shared || shared->kind != Json::Kind::Object) return false;
  for (const auto &item : shared->object) {
    if (item.first.size() > kEventBytes || item.second.kind != Json::Kind::String || item.second.string.size() > kEventBytes || !validUtf8(item.first) || !validUtf8(item.second.string)) return false;
    if(!arena.charge(item.first.size()+item.second.string.size()+kContainerCharge)){code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;return false;} config.shared.emplace(item.first, item.second.string);
  }
  const Json *items = member(*host, "itemCodeInfo");
  if (!items || items->kind != Json::Kind::Array) return false;
  for (const Json &item : items->array) {
    if (!exactKeys(item, {"code", "kind", "marketLink", "value"})) return false;
    ItemKey key; std::string value;
    if (!boundedString(member(item, "code"), key.code) || !boundedString(member(item, "kind"), key.kind) ||
        !boundedString(member(item, "marketLink"), key.market) || !boundedString(member(item, "value"), value) ||
        (key.kind != "markettext" && key.kind != "exchangecode")) return false;
    if(!arena.charge(key.code.size()+key.kind.size()+key.market.size()+value.size()+kContainerCharge)){code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;return false;}
    if(!config.items.emplace(std::move(key), std::move(value)).second) return false;
  }
  const Json *controls = member(root, "controls");
  if (!controls || controls->kind != Json::Kind::Array) return false;
  size_t image_count = 0;
  for (const Json &control : controls->array) {
    if (!exactKeys(control, {"id", "properties", "type"})) return false;
    std::string id, type;
    if (!identifierString(member(control, "id"), id) || reservedGlobal(id) || !identifierString(member(control, "type"), type, 16) || (type != "Button" && type != "Edit" && type != "Image")) return false;
    const Json *properties = member(control, "properties"); if (!properties || properties->kind != Json::Kind::Object) return false;
    ControlState state; state.type = type;
    if (type == "Button") {
      if (!exactKeys(*properties, {"border", "dfgcolor", "enabled"})) return false;
      std::string border, color; const Json *enabled = member(*properties, "enabled");
      if (!boundedString(member(*properties, "border"), border) || !boundedString(member(*properties, "dfgcolor"), color) || !enabled || enabled->kind != Json::Kind::Boolean) return false;
      Scalar a; a.kind=Scalar::Kind::String; a.string=border; state.properties["border"]=a; a.string=color; state.properties["dfgcolor"]=a;
      Scalar b; b.kind=Scalar::Kind::Boolean; b.boolean=enabled->boolean; state.properties["enabled"]=b;
    } else if (type == "Edit") {
      if (!exactKeys(*properties, {"caption"})) return false;
      std::string caption; if (!boundedString(member(*properties, "caption"), caption)) return false;
      Scalar a; a.kind=Scalar::Kind::String; a.string=caption; state.properties["caption"]=a;
    } else {
      if (++image_count > 64) return false;
      if (!exactKeys(*properties, {"autosize", "circle", "enabled", "height", "imgpath", "imagetarget", "left", "top", "visible", "width"})) return false;
      std::string resource;
      const Json *autosize=member(*properties,"autosize"),*circle=member(*properties,"circle"),*enabled=member(*properties,"enabled"),*visible=member(*properties,"visible");
      const Json *target=member(*properties,"imagetarget"),*left=member(*properties,"left"),*top=member(*properties,"top"),*width=member(*properties,"width"),*height=member(*properties,"height");
      if (!boundedString(member(*properties,"imgpath"),resource,2048) || !imageResource(resource) ||
          !autosize || autosize->kind!=Json::Kind::Boolean || !circle || circle->kind!=Json::Kind::Boolean ||
          !enabled || enabled->kind!=Json::Kind::Boolean || !visible || visible->kind!=Json::Kind::Boolean ||
          !boundedInteger(target,0,3) || !boundedInteger(left,-8192,8192) || !boundedInteger(top,-8192,8192) ||
          !boundedInteger(width,0,8192) || !boundedInteger(height,0,8192)) return false;
      Scalar value;value.kind=Scalar::Kind::String;value.string=resource;state.properties["imgpath"]=value;
      value.kind=Scalar::Kind::Number;value.number=target->number;state.properties["imagetarget"]=value;
      value.number=left->number;state.properties["left"]=value;value.number=top->number;state.properties["top"]=value;
      value.number=width->number;state.properties["width"]=value;value.number=height->number;state.properties["height"]=value;
      value.kind=Scalar::Kind::Boolean;value.boolean=visible->boolean;state.properties["visible"]=value;
      value.boolean=enabled->boolean;state.properties["enabled"]=value;value.boolean=autosize->boolean;state.properties["autosize"]=value;
      value.boolean=circle->boolean;state.properties["circle"]=value;
    }
    size_t control_charge=id.size()+type.size()+kContainerCharge;for(const auto &property:state.properties)control_charge+=property.first.size()+(property.second.kind==Scalar::Kind::String?property.second.string.size():sizeof(Scalar))+kContainerCharge;
    if(!arena.charge(control_charge)){code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;return false;} if (!config.controls.emplace(std::move(id), std::move(state)).second) return false;
  }
  const Json *transactions = member(root, "transactions"); if (!transactions || transactions->kind != Json::Kind::Array) return false;
  for (const Json &transaction : transactions->array) {
    if (!exactKeys(transaction, {"blocks", "id"})) return false;
    std::string transaction_id; if (!identifierString(member(transaction, "id"), transaction_id)) return false;
    const Json *blocks = member(transaction, "blocks"); if (!blocks || blocks->kind != Json::Kind::Array) return false;
    for (const Json &block : blocks->array) {
      if (!exactKeys(block, {"fields", "id"})) return false;
      std::string block_id; if (!identifierString(member(block, "id"), block_id)) return false;
      const Json *fields = member(block, "fields"); if (!fields || fields->kind != Json::Kind::Array) return false;
      for (const Json &field : fields->array) {
        if (field.kind != Json::Kind::String || field.string.empty() || field.string.size() > kEventBytes || field.string.find('\0')!=std::string::npos || !validUtf8(field.string)) return false;
        if(!arena.charge(transaction_id.size()+block_id.size()+field.string.size()+kContainerCharge)){code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;return false;} if(!config.fields.insert({transaction_id, block_id, field.string}).second)return false;
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
        !decimalU64(member(root, "baseRevision"), event.base_revision, true) || !identifierString(member(root, "handler"), event.handler)) return false;
    const Json *arguments = member(root, "arguments"), *controls = member(root, "controlMutations");
    if (!arguments || arguments->kind != Json::Kind::Array || !controls || controls->kind != Json::Kind::Array) return false;
    for (const Json &argument : arguments->array) { Scalar value; if (!parseScalar(argument, value)) return false; event.arguments.push_back(std::move(value)); }
    for (const Json &mutation : controls->array) {
      if (!exactKeys(mutation, {"id", "property", "value"})) return false;
      ControlMutation value;
      if (!identifierString(member(mutation, "id"), value.id) || !identifierString(member(mutation, "property"), value.property, 32) ||
          !parseScalar(*member(mutation, "value"), value.value)) return false;
      event.controls.push_back(std::move(value));
    }
    event.kind = EventKind::Handler;
  } else if (kind == "transactionComplete") {
    if (!exactKeys(root, {"blockData", "kind", "requestToken", "runtimeId", "schemaVersion", "tranId"}) ||
        !decimalU64(member(root, "runtimeId"), event.runtime_id) || !decimalU64(member(root, "requestToken"), event.token) ||
        !identifierString(member(root, "tranId"), event.transaction)) return false;
    const Json *blocks = member(root, "blockData"); if (!blocks || blocks->kind != Json::Kind::Array) return false;
    for (const Json &block : blocks->array) {
      if (!exactKeys(block, {"id", "rows"})) return false;
      std::string block_id; if (!identifierString(member(block, "id"), block_id)) return false;
      const Json *rows = member(block, "rows"); if (!rows || rows->kind != Json::Kind::Array) return false;
      for (const Json &row : rows->array) {
        if (!exactKeys(row, {"index", "values"})) return false;
        uint64_t index; if (!parseIndex(member(row, "index"), index)) return false;
        const Json *values = member(row, "values"); if (!values || values->kind != Json::Kind::Object) return false;
        for (const auto &entry : values->object) {
          Scalar value; if (entry.first.empty() || entry.first.size() > kEventBytes || entry.first.find('\0')!=std::string::npos || !validUtf8(entry.first) || !parseScalar(entry.second, value, false)) return false;
          if (!event.block_data.emplace(DataKey{event.transaction, block_id, entry.first, index}, std::move(value)).second) return false;
        }
      }
    }
    event.kind = EventKind::Complete;
  } else if (kind == "transactionError") {
    if (!exactKeys(root, {"code", "kind", "message", "requestToken", "runtimeId", "schemaVersion", "tranId"}) ||
        !decimalU64(member(root, "runtimeId"), event.runtime_id) || !decimalU64(member(root, "requestToken"), event.token) ||
        !identifierString(member(root, "tranId"), event.transaction) || !identifierString(member(root, "code"), event.error_code) ||
        !boundedString(member(root, "message"), event.error_message)) return false;
    event.kind = EventKind::Error;
  } else return false;
  event.encoded_bytes = size;
  return true;
}

struct Stage;

Json hostStateJson(const HostState &state, const Stage *overlay = nullptr);

struct Stage {
  std::map<std::string, std::map<std::string, Scalar>> controls;
  std::map<DataKey, Scalar> data;
  std::set<std::string> cleared_transactions;
  std::vector<Json> commands, diagnostics;
  std::map<uint64_t, std::string> tokens;
  size_t charged = 0;
  uint64_t maximum_token = 0, provisional_token = 0;
  bool close_requested = false, duplicate_close_reported = false,
       in_send_before = false, reserve_close_command = false;
  bool charge(size_t bytes) {
    if (bytes > kStageBytes || charged > kStageBytes - bytes) return false;
    charged += bytes; return true;
  }
  bool command(Json value, size_t bytes) {
    size_t limit=kStageCommands-(reserve_close_command?1:0);
    if (commands.size() >= limit || !charge(bytes + kContainerCharge)) return false;
    commands.push_back(std::move(value)); return true;
  }
  bool reserveCommand(size_t bytes) {
    size_t limit=kStageCommands-(reserve_close_command?1:0);
    return commands.size()<limit&&charge(bytes+kContainerCharge);
  }
};

Json hostStateJson(const HostState &state, const Stage *overlay) {
  Json result = Json::objectValue(), controls = Json::objectValue(), data = Json::objectValue();
  for (const auto &entry : state.controls) {
    Json control = Json::objectValue(), properties = Json::objectValue();
    control.object["type"] = Json::stringValue(entry.second.type);
    for (const auto &property : entry.second.properties) {
      const Scalar *value = &property.second;
      if (overlay) {
        auto staged_control = overlay->controls.find(entry.first);
        if (staged_control != overlay->controls.end()) {
          auto staged_property = staged_control->second.find(property.first);
          if (staged_property != staged_control->second.end()) value = &staged_property->second;
        }
      }
      properties.object[property.first] = scalarJson(*value);
    }
    control.object["properties"] = std::move(properties); controls.object[entry.first] = std::move(control);
  }
  auto appendData = [&](const auto &entry) {
    Json value = Json::objectValue();
    value.object["block"] = Json::stringValue(entry.first.block);
    value.object["field"] = Json::stringValue(entry.first.field);
    value.object["index"] = Json::stringValue(decimal(entry.first.index));
    value.object["transaction"] = Json::stringValue(entry.first.transaction);
    value.object["value"] = scalarJson(entry.second);
    auto part=[](const std::string &value){return decimal(value.size())+":"+value;};
    std::string key = part(entry.first.transaction)+part(entry.first.block)+
                      part(decimal(entry.first.index))+part(entry.first.field);
    data.object[key] = std::move(value);
  };
  for (const auto &entry : state.data) {
    if (overlay && (overlay->cleared_transactions.count(entry.first.transaction) || overlay->data.count(entry.first))) continue;
    appendData(entry);
  }
  if (overlay) for (const auto &entry : overlay->data) appendData(entry);
  result.object["controls"] = std::move(controls); result.object["data"] = std::move(data); return result;
}

enum class Lifecycle { Open, Closing, Closed, Invalid };
const char *lifecycleName(Lifecycle value) {
  switch (value) { case Lifecycle::Open: return "OPEN"; case Lifecycle::Closing: return "CLOSING"; case Lifecycle::Closed: return "CLOSED"; case Lifecycle::Invalid: return "INVALID"; }
  return "INVALID";
}

class Runtime;

std::mutex registry_mutex;
std::map<uint64_t, std::shared_ptr<Runtime>> registry;
std::atomic<uint64_t> next_runtime_id{1}, next_token_id{1};
#ifdef ALLNEWMTS_RUNTIME_TESTING
std::atomic<size_t> next_allocator_limit{kAllocatorBytes};
#endif

bool allocateIdentifier(std::atomic<uint64_t> &counter, uint64_t &identifier) {
  uint64_t candidate = counter.load(std::memory_order_relaxed);
  for (;;) {
    if (!candidate) return false;
    uint64_t next = candidate == std::numeric_limits<uint64_t>::max()
        ? 0
        : candidate + 1;
    if (counter.compare_exchange_weak(candidate, next,
                                      std::memory_order_relaxed,
                                      std::memory_order_relaxed)) {
      identifier = candidate;
      return true;
    }
  }
}

bool instructionLimitExceeded(uint64_t instructions) {
  return instructions > kInstructionLimit;
}

class Runtime : public std::enable_shared_from_this<Runtime> {
 public:
  Runtime(uint64_t id, std::vector<uint8_t> config, AllNewMTSRuntimeOutputSink sink,
          AllNewMTSRuntimeReleaseContext release, void *context,size_t allocator_limit)
      : id_(id), config_bytes_(std::move(config)), sink_(sink), release_(release), context_(context),allocator_limit_(allocator_limit) {}
  ~Runtime() { if (worker_.joinable()) { if(std::this_thread::get_id()==worker_.get_id())worker_.detach();else worker_.join(); } releaseContext(); }

  uint32_t start() {
    auto self=shared_from_this();
    worker_ = std::thread([self] {
      try { self->workerMain(); }
      catch (...) {
        self->closeLua();
        { std::lock_guard<std::mutex> lock(self->mutex_); self->init_code_=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT; self->lifecycle_=Lifecycle::Invalid; self->ready_=true; self->clearPendingLocked(); self->cancelTokensLocked(); }
        self->ready_cv_.notify_all(); self->releaseContext(); self->removeRegistry();
      }
    });
    std::unique_lock<std::mutex> lock(mutex_); ready_cv_.wait(lock, [this] { return ready_; });
    uint32_t code = init_code_; lock.unlock();
    if (code != ALLNEWMTS_RUNTIME_OK && worker_.joinable()) worker_.join();
    return code;
  }
  void takeContext() { owns_context_.store(true); }
  bool workerThread() const { return std::this_thread::get_id()==worker_id_; }

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
    }
    uint32_t admission_failure=1;
    if (native_failure_.compare_exchange_strong(admission_failure,0)) return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT, id_, 0};
    uint64_t revision=admission_revision_+1;
    event.revision=revision;
    try { queue_.push_back(std::move(event)); } catch (...) { return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,id_,0}; }
    if(queue_.back().kind!=EventKind::Handler){tokens_.erase(queue_.back().token);outstanding_tokens_.store(tokens_.size(),std::memory_order_release);}
    admission_revision_=revision;pending_bytes_+=queue_.back().encoded_bytes;cv_.notify_one();
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
  bool budgetExpired() const { return timed_out_ || instructionLimitExceeded(instruction_count_.load()) || std::chrono::steady_clock::now() > deadline_; }
  bool budgetTick() { instruction_count_.fetch_add(kHookInstructions);if(budgetExpired()){timed_out_=true;return true;}return false; }
  bool hostReady() const { return !loading_&&stage_&&!budgetExpired(); }
  bool stageLimited() const { return stage_limit_; }
  void fail(const char *code) { failure_code_=code; }

  const Scalar *readData(const DataKey &key) const {
    auto staged=stage_->data.find(key);if(staged!=stage_->data.end())return &staged->second;
    if(stage_->cleared_transactions.count(key.transaction))return nullptr;
    auto found=committed_.data.find(key);return found==committed_.data.end()?nullptr:&found->second;
  }
  const ControlState *readControl(const std::string &id) const { auto found=committed_.controls.find(id);return found==committed_.controls.end()?nullptr:&found->second; }
  const Scalar *readControlProperty(const std::string &id,const std::string &property) const {
    auto control=stage_->controls.find(id);if(control!=stage_->controls.end()){auto value=control->second.find(property);if(value!=control->second.end())return &value->second;}
    auto base=committed_.controls.find(id);if(base==committed_.controls.end())return nullptr;auto value=base->second.properties.find(property);return value==base->second.properties.end()?nullptr:&value->second;
  }

  bool setData(DataKey key, Scalar value) {
    if (!config_.fields.count({key.transaction, key.block, key.field})) return false;
    size_t bytes = key.transaction.size()+key.block.size()+key.field.size()+(value.kind==Scalar::Kind::String?value.string.size():sizeof(value))+kContainerCharge;
    if (!stage_->charge(bytes)) { stage_limit_ = true; return false; }
    stage_->data[std::move(key)] = std::move(value); return true;
  }
  bool setControl(const std::string &id, const std::string &property, Scalar value) {
    auto found = committed_.controls.find(id); if (found == committed_.controls.end()) return false;
    bool valid = (found->second.type == "Edit" && property == "caption" && value.kind == Scalar::Kind::String) ||
                 (found->second.type == "Button" && (property == "border" || property == "dfgcolor") && value.kind == Scalar::Kind::String) ||
                 (found->second.type == "Button" && property == "enabled" && value.kind == Scalar::Kind::Boolean) ||
                 (found->second.type == "Image" && property == "imgpath" && value.kind == Scalar::Kind::String && imageResource(value.string)) ||
                 (found->second.type == "Image" && property == "imagetarget" && value.kind == Scalar::Kind::Number && value.number >= 0 && value.number <= 3 && std::floor(value.number) == value.number) ||
                 (found->second.type == "Image" && (property == "visible" || property == "enabled" || property == "autosize" || property == "circle") && value.kind == Scalar::Kind::Boolean) ||
                 (found->second.type == "Image" && (property == "left" || property == "top") && value.kind == Scalar::Kind::Number && value.number >= -8192 && value.number <= 8192 && std::floor(value.number) == value.number) ||
                 (found->second.type == "Image" && (property == "width" || property == "height") && value.kind == Scalar::Kind::Number && value.number >= 0 && value.number <= 8192 && std::floor(value.number) == value.number);
    if (!valid || !stage_->charge(id.size()+property.size()+(value.kind==Scalar::Kind::String?value.string.size():sizeof(value))+kContainerCharge)) { if (valid) stage_limit_=true; return false; }
    stage_->controls[id][property] = std::move(value); return true;
  }
  bool addCommand(Json command, size_t charge) { if (!stage_->command(std::move(command), charge)) { stage_limit_=true; return false; } return true; }
  void requestClose() {
    if (stage_->close_requested && !stage_->duplicate_close_reported) {
      if (!stage_->charge(sizeof("DUPLICATE_CLOSE") + kContainerCharge)) { stage_limit_=true; return; }
      Json d=Json::objectValue(); d.object["code"]=Json::stringValue("DUPLICATE_CLOSE"); d.object["source"]=Json::stringValue("runtime"); stage_->diagnostics.push_back(std::move(d)); stage_->duplicate_close_reported=true;
    }
    stage_->close_requested = true;
  }
  bool prepareRequest(uint64_t &token) {
    if (outstanding_tokens_.load(std::memory_order_acquire) + stage_->tokens.size() >= kTokens ||
        stage_->provisional_token || !allocateIdentifier(next_token_id, token)) {
      stage_limit_ = true;
      return false;
    }
    stage_->provisional_token = token;
#ifdef ALLNEWMTS_RUNTIME_TESTING
    pausePreparedRequest();
#endif
    return true;
  }
  bool issueRequest(std::string_view transaction, uint64_t token);
  bool dataCount(const std::string &transaction,const std::string &block,uint64_t &count) const {
    bool declared=false;for(const FieldKey &field:config_.fields)if(field.transaction==transaction&&field.block==block){declared=true;break;}if(!declared)return false;
    count=0;for(const auto &entry:committed_.data)if(entry.first.transaction==transaction&&entry.first.block==block&&!stage_->cleared_transactions.count(transaction)&&!stage_->data.count(entry.first))count=std::max(count,entry.first.index+1);
    for(const auto &entry:stage_->data)if(entry.first.transaction==transaction&&entry.first.block==block)count=std::max(count,entry.first.index+1);return true;
  }
#ifdef ALLNEWMTS_RUNTIME_TESTING
  void setAllocatorLimit(size_t value){allocator_limit_.store(value);}
  void failNextNativeAllocation(uint32_t phase){native_failure_.store(phase);}
  void armRequestPause(){std::lock_guard<std::mutex> lock(request_test_mutex_);pause_request_=true;request_prepared_=false;resume_request_=false;}
  bool waitRequestPrepared(){std::unique_lock<std::mutex> lock(request_test_mutex_);return request_test_cv_.wait_for(lock,std::chrono::seconds(2),[this]{return request_prepared_;});}
  void resumeRequest(){std::lock_guard<std::mutex> lock(request_test_mutex_);resume_request_=true;request_test_cv_.notify_all();}
#endif

#ifdef ALLNEWMTS_RUNTIME_TESTING
  void counters(AllNewMTSRuntimeTestCounters &out) {
    std::lock_guard<std::mutex> lock(mutex_); out.allocator_current=allocated_.load(); out.allocator_peak=peak_.load(); out.committed_bytes=committed_bytes_;
    out.staged_bytes=stage_?stage_->charged:0; out.staged_commands=stage_?stage_->commands.size():0; out.pending_events=queue_.size(); out.pending_bytes=pending_bytes_; out.outstanding_tokens=outstanding_tokens_.load();
    out.outstanding_token_bytes=0;for(const auto &token:tokens_)out.outstanding_token_bytes+=token.second.size();out.last_staged_bytes=last_staged_bytes_;out.token_commit_copied_bytes=token_commit_copied_bytes_;
  }
#endif

  static void *allocate(void *opaque, void *pointer, size_t old_size, size_t new_size) {
    Runtime *runtime = static_cast<Runtime *>(opaque);
    size_t allocated=runtime->allocated_.load(),limit=runtime->allocator_limit_.load();
    if (!new_size) { std::free(pointer); runtime->allocated_.store(old_size<=allocated?allocated-old_size:0); return nullptr; }
    if (new_size > old_size && (allocated>limit||new_size-old_size>limit-allocated)) { runtime->allocation_failed_=true; return nullptr; }
    void *changed=std::realloc(pointer,new_size); if (!changed) { runtime->allocation_failed_=true; return nullptr; }
    allocated=allocated-old_size+new_size;runtime->allocated_.store(allocated);size_t peak=runtime->peak_.load();while(peak<allocated&&!runtime->peak_.compare_exchange_weak(peak,allocated)){}return changed;
  }
 private:
  void releaseContext() { if (owns_context_.exchange(false) && release_) release_(context_); }
  void clearPendingLocked() { queue_.clear(); pending_bytes_=0; }
  void cancelTokensLocked() { if (!tokens_.empty()) canceled_token_=std::max(canceled_token_,tokens_.rbegin()->first); tokens_.clear(); outstanding_tokens_.store(0,std::memory_order_release); }
  bool loadEntry(uint32_t &code);
  bool runEvent(Event &event, bool internal);
  bool freeze(Event &event, bool ok, Lifecycle shown, const char *next, std::vector<Json> commands, std::vector<Json> diagnostics, const HostState &state, const Stage *overlay, std::string &encoded, size_t *state_bytes = nullptr);
  void deliver(const std::string &encoded) { if(sink_)sink_(context_,id_,reinterpret_cast<const uint8_t *>(encoded.data()),encoded.size()); }
  void workerMain();
  void invalidate(Event &event, const char *diagnostic, bool closing);
  bool callHandler(const char *name, const Event &event);
  void removeRegistry();
  void closeLua() { if (lua_) { allnewmts_lua_clear_budget_hook(lua_); lua_close(lua_); lua_=nullptr; } }
  void beginBudget() { allocation_failed_=false; timed_out_=false; stage_limit_=false; failure_code_=nullptr; instruction_count_=0; deadline_=std::chrono::steady_clock::now()+kDeadline; allnewmts_lua_set_budget_hook(lua_,static_cast<int>(kHookInstructions)); }
  void endBudget() { if (lua_) allnewmts_lua_clear_budget_hook(lua_); }
#ifdef ALLNEWMTS_RUNTIME_TESTING
  void pausePreparedRequest(){std::unique_lock<std::mutex> lock(request_test_mutex_);if(!pause_request_)return;request_prepared_=true;request_test_cv_.notify_all();request_test_cv_.wait(lock,[this]{return resume_request_;});pause_request_=false;}
#endif

  uint64_t id_; std::vector<uint8_t> config_bytes_; Config config_; HostState committed_; size_t committed_bytes_=0;
  AllNewMTSRuntimeOutputSink sink_; AllNewMTSRuntimeReleaseContext release_; void *context_; std::atomic<bool> owns_context_{false};
  lua_State *lua_=nullptr; Stage *stage_=nullptr; bool loading_=true, allocation_failed_=false, timed_out_=false, stage_limit_=false;
  const char *failure_code_=nullptr;
  std::atomic<size_t> allocated_{0},peak_{0},allocator_limit_{kAllocatorBytes}; std::atomic<uint64_t> instruction_count_{0}; std::chrono::steady_clock::time_point deadline_;
  std::atomic<uint32_t> native_failure_{0};
  std::mutex mutex_; std::condition_variable cv_,ready_cv_; std::deque<Event> queue_; size_t pending_bytes_=0;
  uint64_t admission_revision_=0,published_revision_=0,issued_token_=0,canceled_token_=0; std::map<uint64_t,std::string> tokens_; std::atomic<size_t> outstanding_tokens_{0};
  size_t last_staged_bytes_=0,token_commit_copied_bytes_=0;
  Lifecycle lifecycle_=Lifecycle::Open; bool destroy_requested_=false,ready_=false; uint32_t init_code_=ALLNEWMTS_RUNTIME_LOAD_ERROR;
  std::thread worker_; std::thread::id worker_id_;
#ifdef ALLNEWMTS_RUNTIME_TESTING
  std::mutex request_test_mutex_; std::condition_variable request_test_cv_; bool pause_request_=false,request_prepared_=false,resume_request_=false;
#endif
};

void Runtime::removeRegistry(){std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(id_);if(found!=registry.end()&&found->second.get()==this)registry.erase(found);}

static bool luaString(lua_State *state,int index,std::string &result) {
  if(lua_type(state,index)!=LUA_TSTRING)return false;
  size_t size=0;const char *value=lua_tolstring(state,index,&size);
  if(!value||size>kEventBytes)return false;result.assign(value,size);return validUtf8(result);
}
static bool luaFinite(lua_State *state,int index,double &result) {
  if(lua_type(state,index)!=LUA_TNUMBER)return false;result=lua_tonumber(state,index);return std::isfinite(result);
}
static bool luaScalar(lua_State *state,int index,Scalar &result,bool boolean=false) {
  if(lua_type(state,index)==LUA_TSTRING){result.kind=Scalar::Kind::String;return luaString(state,index,result.string);}
  if(lua_type(state,index)==LUA_TNUMBER){result.kind=Scalar::Kind::Number;return luaFinite(state,index,result.number);}
  if(boolean&&lua_type(state,index)==LUA_TBOOLEAN){result.kind=Scalar::Kind::Boolean;result.boolean=lua_toboolean(state,index)!=0;return true;}
  return false;
}
static void luaValue(const Scalar &source,AllNewMTSLuaValue *value) {
  value->kind=source.kind==Scalar::Kind::String?ALLNEWMTS_LUA_VALUE_STRING:(source.kind==Scalar::Kind::Number?ALLNEWMTS_LUA_VALUE_NUMBER:ALLNEWMTS_LUA_VALUE_BOOLEAN);
  value->bytes=source.string.data();value->size=source.string.size();value->number=source.number;value->boolean=source.boolean;
}
template<class Work> int caught(Work &&work) noexcept { try{return work();}catch(...){return ALLNEWMTS_LUA_LIMIT;} }

extern "C" size_t allnewmts_runtime_lua_control_count(void *opaque){auto *runtime=static_cast<Runtime *>(opaque);return runtime?runtime->config().controls.size():0;}
extern "C" int allnewmts_runtime_lua_control(void *opaque,size_t index,const char **id,size_t *size){
  auto *runtime=static_cast<Runtime *>(opaque);if(!runtime||!id||!size)return 0;auto it=runtime->config().controls.begin();while(index--&&it!=runtime->config().controls.end())++it;if(it==runtime->config().controls.end())return 0;*id=it->first.data();*size=it->first.size();return 1;
}
extern "C" void allnewmts_runtime_lua_fail(void *opaque,const char *code){auto *runtime=static_cast<Runtime *>(opaque);if(runtime)runtime->fail(code);}
extern "C" int allnewmts_runtime_lua_budget_expired(void *opaque){
  auto *runtime=static_cast<Runtime *>(opaque);if(!runtime)return 1;return runtime->budgetTick()?1:0;
}

extern "C" int allnewmts_runtime_lua_host(void *opaque,int operation,lua_State *state,AllNewMTSLuaValue *output){
  auto *runtime=static_cast<Runtime *>(opaque);if(!runtime||!output)return ALLNEWMTS_LUA_ARGUMENT;
  return caught([&]{
    if(!runtime->hostReady()||!state)return ALLNEWMTS_LUA_ARGUMENT;
    int top=lua_gettop(state);std::string a,b,c,d,e;double first,last;Scalar scalar;
    switch(operation){
      case ALLNEWMTS_LUA_GET_OPEN:
        if(top)return ALLNEWMTS_LUA_ARGUMENT;output->kind=ALLNEWMTS_LUA_VALUE_STRING;output->bytes=runtime->config().open_link.data();output->size=runtime->config().open_link.size();return ALLNEWMTS_LUA_OK;
      case ALLNEWMTS_LUA_GET_SHARED:{
        if(top!=2||lua_type(state,2)!=LUA_TBOOLEAN||lua_toboolean(state,2)||!luaString(state,1,a))return ALLNEWMTS_LUA_ARGUMENT;auto found=runtime->config().shared.find(a);if(found==runtime->config().shared.end())return ALLNEWMTS_LUA_LOOKUP;output->kind=ALLNEWMTS_LUA_VALUE_STRING;output->bytes=found->second.data();output->size=found->second.size();return ALLNEWMTS_LUA_OK;}
      case ALLNEWMTS_LUA_GET_ITEM:{
        if((top!=2&&top!=3)||!luaString(state,1,a)||!luaString(state,2,b)||(b!="markettext"&&b!="exchangecode")||(top==3&&!luaString(state,3,c)))return ALLNEWMTS_LUA_ARGUMENT;auto found=runtime->config().items.find({a,b,c});if(found==runtime->config().items.end())return ALLNEWMTS_LUA_LOOKUP;output->kind=ALLNEWMTS_LUA_VALUE_STRING;output->bytes=found->second.data();output->size=found->second.size();return ALLNEWMTS_LUA_OK;}
      case ALLNEWMTS_LUA_MESSAGE:{
        if(top!=6||!luaString(state,1,a)||!luaString(state,2,b)||!luaString(state,3,c)||!luaString(state,4,d)||!d.empty()||!luaString(state,5,e)||!luaFinite(state,6,first)||first!=0)return ALLNEWMTS_LUA_ARGUMENT;
        size_t charge=a.size()+b.size()+c.size()+e.size()+5*kContainerCharge;if(!runtime->stage()->reserveCommand(charge))return ALLNEWMTS_LUA_LIMIT;
        Json command=Json::objectValue();command.object["confirmLabel"]=Json::stringValue(e);command.object["key"]=Json::stringValue(c);command.object["message"]=Json::stringValue(b);command.object["title"]=Json::stringValue(a);command.object["type"]=Json::stringValue("messageBox");runtime->stage()->commands.push_back(std::move(command));return ALLNEWMTS_LUA_OK;}
      case ALLNEWMTS_LUA_TOAST:{
        if(top!=3||!luaFinite(state,1,first)||first!=0||!luaString(state,2,a)||!luaFinite(state,3,last)||last!=1)return ALLNEWMTS_LUA_ARGUMENT;
        if(!runtime->stage()->reserveCommand(a.size()+4*kContainerCharge))return ALLNEWMTS_LUA_LIMIT;Json command=Json::objectValue();command.object["duration"]=Json::numberValue(1);command.object["kind"]=Json::numberValue(0);command.object["message"]=Json::stringValue(a);command.object["type"]=Json::stringValue("toast");runtime->stage()->commands.push_back(std::move(command));return ALLNEWMTS_LUA_OK;}
      case ALLNEWMTS_LUA_RETURN:{
        if(top!=3||lua_type(state,3)!=LUA_TBOOLEAN||!lua_toboolean(state,3)||!luaString(state,1,a)||!luaString(state,2,b))return ALLNEWMTS_LUA_ARGUMENT;
        if(!runtime->stage()->reserveCommand(a.size()+b.size()+3*kContainerCharge))return ALLNEWMTS_LUA_LIMIT;Json command=Json::objectValue();command.object["name"]=Json::stringValue(a);command.object["payload"]=Json::stringValue(b);command.object["type"]=Json::stringValue("returnToParent");runtime->stage()->commands.push_back(std::move(command));runtime->requestClose();return runtime->stageLimited()?ALLNEWMTS_LUA_LIMIT:ALLNEWMTS_LUA_OK;}
      case ALLNEWMTS_LUA_CLOSE:
        if(top)return ALLNEWMTS_LUA_ARGUMENT;runtime->requestClose();return runtime->stageLimited()?ALLNEWMTS_LUA_LIMIT:ALLNEWMTS_LUA_OK;
      case ALLNEWMTS_LUA_SET_DATA:{
        DataKey key;if(top!=6||lua_type(state,1)!=LUA_TBOOLEAN||lua_toboolean(state,1)||!luaString(state,2,key.transaction)||!luaString(state,3,key.block)||!luaString(state,4,key.field)||!luaFinite(state,5,first)||first<0||std::floor(first)!=first||first>9007199254740991.0||!luaScalar(state,6,scalar))return ALLNEWMTS_LUA_ARGUMENT;key.index=static_cast<uint64_t>(first);return runtime->setData(std::move(key),std::move(scalar))?ALLNEWMTS_LUA_OK:(runtime->stageLimited()?ALLNEWMTS_LUA_LIMIT:ALLNEWMTS_LUA_LOOKUP);}
      case ALLNEWMTS_LUA_GET_COUNT:{
        if(top!=3||lua_type(state,1)!=LUA_TBOOLEAN||lua_toboolean(state,1)||!luaString(state,2,a)||!luaString(state,3,b))return ALLNEWMTS_LUA_ARGUMENT;uint64_t count=0;if(!runtime->dataCount(a,b,count))return ALLNEWMTS_LUA_LOOKUP;output->kind=ALLNEWMTS_LUA_VALUE_NUMBER;output->number=static_cast<double>(count);return ALLNEWMTS_LUA_OK;}
      case ALLNEWMTS_LUA_GET_VALUE:{
        DataKey key;if(top!=5||lua_type(state,1)!=LUA_TBOOLEAN||lua_toboolean(state,1)||!luaString(state,2,key.transaction)||!luaString(state,3,key.block)||!luaString(state,4,key.field)||!luaFinite(state,5,first)||first<0||std::floor(first)!=first||first>9007199254740991.0)return ALLNEWMTS_LUA_ARGUMENT;key.index=static_cast<uint64_t>(first);if(!runtime->config().fields.count({key.transaction,key.block,key.field}))return ALLNEWMTS_LUA_LOOKUP;const Scalar *value=runtime->readData(key);if(!value)return ALLNEWMTS_LUA_LOOKUP;luaValue(*value,output);return ALLNEWMTS_LUA_OK;}
      case ALLNEWMTS_LUA_TRIM:{
        if(top!=1||!luaString(state,1,a))return ALLNEWMTS_LUA_ARGUMENT;auto ws=[](unsigned char value){return value==' '||value=='\t'||value=='\r'||value=='\n'||value=='\f'||value=='\v';};if(!a.empty()&&(ws(static_cast<unsigned char>(a.front()))||ws(static_cast<unsigned char>(a.back()))))return ALLNEWMTS_LUA_ARGUMENT;size_t size=0;const char *value=lua_tolstring(state,1,&size);output->kind=ALLNEWMTS_LUA_VALUE_STRING;output->bytes=value;output->size=size;return ALLNEWMTS_LUA_OK;}
    }
    return ALLNEWMTS_LUA_ARGUMENT;
  });
}

extern "C" int allnewmts_runtime_lua_control_call(AllNewMTSLuaControlRef *ref,int operation,lua_State *state,AllNewMTSLuaValue *output){
  if(!ref||!ref->runtime||!state||!output)return ALLNEWMTS_LUA_ARGUMENT;auto *runtime=static_cast<Runtime *>(ref->runtime);
  return caught([&]{
    if(!runtime->hostReady())return ALLNEWMTS_LUA_ARGUMENT;std::string id(ref->id,ref->id_size),key;const ControlState *control=runtime->readControl(id);if(!control)return ALLNEWMTS_LUA_LOOKUP;
    if(operation==0){
      if(lua_gettop(state)!=2||!luaString(state,2,key))return ALLNEWMTS_LUA_ARGUMENT;
      bool readable=(control->type=="Edit"&&key=="caption")||(control->type=="Image"&&(key=="imgpath"||key=="visible"||key=="left"||key=="top"||key=="width"||key=="height"));
      if(readable){const Scalar *value=runtime->readControlProperty(id,key);if(!value)return ALLNEWMTS_LUA_LOOKUP;luaValue(*value,output);return ALLNEWMTS_LUA_OK;}
      if(control->type=="Button"&&key=="SetRadius"){output->kind=ALLNEWMTS_LUA_VALUE_METHOD;return ALLNEWMTS_LUA_OK;}
      return ALLNEWMTS_LUA_LOOKUP;
    }
    if(operation==1){
      if(lua_gettop(state)!=3||!luaString(state,2,key))return ALLNEWMTS_LUA_ARGUMENT;
      Scalar value;
      if(control->type=="Button"){
        if(key=="enable")key="enabled";bool boolean=key=="enabled";
        if((key!="border"&&key!="dfgcolor"&&key!="enabled")||!luaScalar(state,3,value,boolean))return ALLNEWMTS_LUA_ARGUMENT;
      }else if(control->type=="Image"){
        if(key=="enable")key="enabled";
        if(key=="imgpath"){
          value.kind=Scalar::Kind::String;if(!luaString(state,3,value.string)||!imageResource(value.string))return ALLNEWMTS_LUA_ARGUMENT;
        }else if(key=="visible"||key=="enabled"||key=="autosize"||key=="circle"){
          if(lua_type(state,3)!=LUA_TBOOLEAN)return ALLNEWMTS_LUA_ARGUMENT;value.kind=Scalar::Kind::Boolean;value.boolean=lua_toboolean(state,3)!=0;
        }else if(key=="imagetarget"||key=="left"||key=="top"||key=="width"||key=="height"){
          value.kind=Scalar::Kind::Number;if(!luaFinite(state,3,value.number)||std::floor(value.number)!=value.number)return ALLNEWMTS_LUA_ARGUMENT;
          if((key=="imagetarget"&&(value.number<0||value.number>3))||((key=="left"||key=="top")&&(value.number<-8192||value.number>8192))||((key=="width"||key=="height")&&(value.number<0||value.number>8192)))return ALLNEWMTS_LUA_ARGUMENT;
        }else return ALLNEWMTS_LUA_ARGUMENT;
      }else return ALLNEWMTS_LUA_ARGUMENT;
      return runtime->setControl(id,key,std::move(value))?ALLNEWMTS_LUA_OK:(runtime->stageLimited()?ALLNEWMTS_LUA_LIMIT:ALLNEWMTS_LUA_LOOKUP);
    }
    if(operation==2){double first,last;std::string value;if(lua_gettop(state)!=10||control->type!="Button"||!luaFinite(state,2,first)||!luaString(state,3,value)||!luaString(state,4,value)||!luaString(state,5,value)||lua_type(state,6)!=LUA_TBOOLEAN||!luaString(state,7,value)||!luaString(state,8,value)||!luaString(state,9,value)||!luaFinite(state,10,last))return ALLNEWMTS_LUA_ARGUMENT;return ALLNEWMTS_LUA_OK;}
    return ALLNEWMTS_LUA_ARGUMENT;
  });
}

extern "C" int allnewmts_runtime_lua_prepare_request(void *opaque,lua_State *state,const char **transaction,size_t *size,uint64_t *token){
  auto *runtime=static_cast<Runtime *>(opaque);if(!runtime||!state||!transaction||!size||!token)return ALLNEWMTS_LUA_ARGUMENT;
  return caught([&]{if(!runtime->hostReady()||lua_gettop(state)!=1||runtime->stage()->in_send_before)return ALLNEWMTS_LUA_ARGUMENT;const char *value=nullptr;size_t amount=0;if(lua_type(state,1)!=LUA_TSTRING||(value=lua_tolstring(state,1,&amount))==nullptr||amount>kEventBytes)return ALLNEWMTS_LUA_ARGUMENT;bool declared=false;for(const FieldKey &field:runtime->config().fields)if(field.transaction.size()==amount&&std::memcmp(field.transaction.data(),value,amount)==0){declared=true;break;}if(!declared)return ALLNEWMTS_LUA_LOOKUP;if(!runtime->prepareRequest(*token))return ALLNEWMTS_LUA_LIMIT;runtime->stage()->in_send_before=true;*transaction=value;*size=amount;return ALLNEWMTS_LUA_OK;});
}
extern "C" int allnewmts_runtime_lua_finish_request(void *opaque,const char *transaction,size_t size,uint64_t token,int nested){
  auto *runtime=static_cast<Runtime *>(opaque);if(!runtime)return ALLNEWMTS_LUA_ARGUMENT;runtime->stage()->in_send_before=false;if(nested!=ALLNEWMTS_LUA_OK){runtime->stage()->provisional_token=0;return nested;}return caught([&]{return runtime->issueRequest(std::string_view(transaction,size),token)?ALLNEWMTS_LUA_OK:(runtime->stageLimited()?ALLNEWMTS_LUA_LIMIT:ALLNEWMTS_LUA_LOOKUP);});
}
extern "C" int allnewmts_runtime_lua_prepare_dofile(void *opaque,lua_State *state,const AllNewMTSResource **resource,const char **path,size_t *size){
  auto *runtime=static_cast<Runtime *>(opaque);if(!runtime||!state||!resource||!path||!size)return ALLNEWMTS_LUA_ARGUMENT;
  return caught([&]{if(lua_gettop(state)!=1||lua_type(state,1)!=LUA_TSTRING)return ALLNEWMTS_LUA_ARGUMENT;const char *value=lua_tolstring(state,1,size);if(!value||*size>kEventBytes)return ALLNEWMTS_LUA_ARGUMENT;std::string logical(value,*size);if(!canonicalResourcePath(logical))return ALLNEWMTS_LUA_ARGUMENT;*resource=allnewmts_resource(value,*size);if(!*resource)return ALLNEWMTS_LUA_LOOKUP;unsigned char hash[32];allnewmts_sha256((*resource)->bytes,(*resource)->size,hash);if(std::memcmp(hash,(*resource)->sha256,32)!=0)return ALLNEWMTS_LUA_LOOKUP;*path=value;return ALLNEWMTS_LUA_OK;});
}
extern "C" size_t allnewmts_runtime_lua_argument_count(const void *opaque){auto *event=static_cast<const Event *>(opaque);return event&&event->kind==EventKind::Handler?event->arguments.size():0;}
extern "C" int allnewmts_runtime_lua_argument(const void *opaque,size_t index,AllNewMTSLuaValue *value){auto *event=static_cast<const Event *>(opaque);if(!event||!value||index>=event->arguments.size())return 0;luaValue(event->arguments[index],value);return 1;}
extern "C" int allnewmts_runtime_lua_event_kind(const void *opaque){auto *event=static_cast<const Event *>(opaque);return event?static_cast<int>(event->kind):0;}
extern "C" int allnewmts_runtime_lua_event_strings(const void *opaque,AllNewMTSLuaValue values[3]){auto *event=static_cast<const Event *>(opaque);if(!event||(event->kind!=EventKind::Complete&&event->kind!=EventKind::Error))return 0;values[0]={event->transaction.data(),event->transaction.size(),0,0,ALLNEWMTS_LUA_VALUE_STRING};if(event->kind==EventKind::Error){values[1]={event->error_code.data(),event->error_code.size(),0,0,ALLNEWMTS_LUA_VALUE_STRING};values[2]={event->error_message.data(),event->error_message.size(),0,0,ALLNEWMTS_LUA_VALUE_STRING};}return 1;}

bool Runtime::loadEntry(uint32_t &code) {
  code=ALLNEWMTS_RUNTIME_LOAD_ERROR;lua_=lua_newstate(allocate,this);if(!lua_){code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;return false;}
  beginBudget();int status=allnewmts_lua_install(lua_,this);const AllNewMTSResource *resource=nullptr;
  if(!status){resource=allnewmts_resource(config_.entry_path.data(),config_.entry_path.size());if(!resource){endBudget();code=ALLNEWMTS_RUNTIME_RESOURCE_NOT_FOUND;return false;}unsigned char hash[32];allnewmts_sha256(resource->bytes,resource->size,hash);if(std::memcmp(hash,resource->sha256,32)!=0||std::memcmp(hash,config_.entry_hash,32)!=0){endBudget();code=ALLNEWMTS_RUNTIME_RESOURCE_HASH_MISMATCH;return false;}status=allnewmts_lua_load_entry(lua_,this,resource,config_.entry_path.data(),config_.entry_path.size());if(!status)status=allnewmts_lua_validate_boundary(lua_,this);}
  endBudget();if(status){code=(allocation_failed_||timed_out_)?ALLNEWMTS_RUNTIME_RESOURCE_LIMIT:ALLNEWMTS_RUNTIME_LOAD_ERROR;return false;}lua_settop(lua_,0);loading_=false;code=ALLNEWMTS_RUNTIME_OK;return true;
}

bool Runtime::callHandler(const char *name,const Event &event) {
  size_t size=event.kind==EventKind::Handler?event.handler.size():std::strlen(name);AllNewMTSLuaInvocation call{this,&event,name,size,event.kind==EventKind::InternalClose};int status=allnewmts_lua_call_handler(lua_,&call);if(!status)status=allnewmts_lua_validate_boundary(lua_,this);if(status){if(!failure_code_)failure_code_="LUA_ERROR";return false;}lua_settop(lua_,0);return !budgetExpired();
}

bool Runtime::issueRequest(std::string_view transaction, uint64_t token) {
  if (!token || stage_->provisional_token != token) { stage_limit_=true; return false; }
  stage_->provisional_token=0;
  auto charge=[&](size_t bytes){if(!stage_->charge(bytes)){stage_limit_=true;return false;}return true;};
  if(stage_->commands.size()>=kStageCommands-(stage_->reserve_close_command?1:0) ||
     !charge(transaction.size()*2+decimalDigits(token)+decimalDigits(id_)+8*kContainerCharge))return false;
  Json command=Json::objectValue(),blocks=Json::arrayValue();
  std::map<std::pair<std::string_view,uint64_t>,Json> grouped;
  auto append=[&](const DataKey &key,const Scalar &value){
    if(key.transaction.size()!=transaction.size()||std::memcmp(key.transaction.data(),transaction.data(),transaction.size())!=0)return true;
    auto group=std::make_pair(std::string_view(key.block),key.index);auto found=grouped.find(group);
    if(found==grouped.end()){
      if(!charge(key.block.size()+decimalDigits(key.index)+5*kContainerCharge))return false;
      std::string index=decimal(key.index);
      Json row=Json::objectValue();row.object["block"]=Json::stringValue(key.block);row.object["index"]=Json::stringValue(std::move(index));row.object["values"]=Json::objectValue();found=grouped.emplace(group,std::move(row)).first;
    }
    size_t scalar_bytes=value.kind==Scalar::Kind::String?value.string.size():sizeof(value);
    if(!charge(key.field.size()+scalar_bytes+2*kContainerCharge))return false;
    found->second.object["values"].object[key.field]=scalarJson(value);return true;
  };
  bool cleared=false;for(const auto &value:stage_->cleared_transactions)if(value.size()==transaction.size()&&std::memcmp(value.data(),transaction.data(),transaction.size())==0){cleared=true;break;}
  for(const auto &entry:committed_.data)if(!cleared&&!stage_->data.count(entry.first)&&!append(entry.first,entry.second))return false;
  for(const auto &entry:stage_->data)if(!append(entry.first,entry.second))return false;
  for(auto &entry:grouped)blocks.array.push_back(std::move(entry.second));
  command.object["blocks"]=std::move(blocks);command.object["requestToken"]=Json::stringValue(decimal(token));command.object["runtimeId"]=Json::stringValue(decimal(id_));command.object["tranId"]=Json::stringValue(std::string(transaction));command.object["type"]=Json::stringValue("requestTranData");
  stage_->commands.push_back(std::move(command));auto inserted=stage_->tokens.emplace(token,std::string(transaction));if(!inserted.second){stage_limit_=true;return false;}stage_->maximum_token=std::max(stage_->maximum_token,token);return true;
}

bool Runtime::freeze(Event &event,bool ok,Lifecycle shown,const char *next,std::vector<Json> commands,std::vector<Json> diagnostics,const HostState &state,const Stage *overlay,std::string &encoded,size_t *state_bytes) {
  try {
  Json root=Json::objectValue(),snapshot=Json::objectValue(),commandArray=Json::arrayValue(),diagnosticArray=Json::arrayValue();
  for(const Json &diagnostic:diagnostics){std::string bytes;if(!encodeJson(diagnostic,bytes,kDiagnosticBytes))return false;}
  commandArray.array=std::move(commands); diagnosticArray.array=std::move(diagnostics);
  std::string eventName=event.kind==EventKind::Handler?event.handler:(event.kind==EventKind::Complete?"transactionComplete":(event.kind==EventKind::Error?"transactionError":"Form_OnFormClose"));
  Json state_json=hostStateJson(state,overlay);std::string state_encoded;if(!encodeJson(state_json,state_encoded,kCommittedBytes))return false;if(state_bytes)*state_bytes=state_encoded.size();
  snapshot.object["event"]=Json::stringValue(eventName); snapshot.object["lifecycle"]=Json::stringValue(lifecycleName(shown)); snapshot.object["revision"]=Json::stringValue(decimal(event.revision)); snapshot.object["runtimeId"]=Json::stringValue(decimal(id_)); snapshot.object["state"]=std::move(state_json); snapshot.object["status"]=Json::stringValue(ok?"ok":"error");
  root.object["commands"]=std::move(commandArray); root.object["diagnostics"]=std::move(diagnosticArray); if(next)root.object["nextLifecycle"]=Json::stringValue(next); root.object["schemaVersion"]=Json::numberValue(1); root.object["snapshot"]=std::move(snapshot);
  return encodeJson(root,encoded,kCommittedBytes+kStageBytes+kDiagnosticBytes);
  } catch (...) { encoded.clear(); return false; }
}

void Runtime::invalidate(Event &event,const char *diagnostic,bool closing) {
  Json command=Json::objectValue(); command.object["code"]=Json::stringValue(diagnostic); command.object["type"]=Json::stringValue("runtimeError");
  Json detail=Json::objectValue(); detail.object["code"]=Json::stringValue(diagnostic); detail.object["event"]=Json::stringValue(event.kind==EventKind::Handler&&event.handler.size()<=1024?event.handler:"runtime"); detail.object["source"]=Json::stringValue("supervisor");
  std::vector<Json> commands{std::move(command)},diagnostics{std::move(detail)};
  if(closing) { Json close=Json::objectValue();close.object["type"]=Json::stringValue("closeForm");commands.push_back(std::move(close)); }
  std::string encoded;if(freeze(event,false,closing?Lifecycle::Closing:Lifecycle::Open,"INVALID",std::move(commands),std::move(diagnostics),committed_,nullptr,encoded))deliver(encoded);
  { std::lock_guard<std::mutex> lock(mutex_); lifecycle_=Lifecycle::Invalid; clearPendingLocked(); cancelTokensLocked(); }
  closeLua(); releaseContext();
  removeRegistry();
}

bool Runtime::runEvent(Event &event,bool internal) {
  Stage stage;stage.reserve_close_command=internal;stage_=&stage;beginBudget();bool ok=true;
  if(event.kind==EventKind::Handler){for(const ControlMutation &mutation:event.controls){Scalar value=mutation.value;if(mutation.property!="caption"||!setControl(mutation.id,mutation.property,std::move(value))){ok=false;break;}}}
  else if(event.kind==EventKind::Complete){if(!stage.charge(event.transaction.size()+kContainerCharge)){stage_limit_=true;ok=false;}else stage.cleared_transactions.insert(event.transaction);if(ok)for(const auto &entry:event.block_data)if(!setData(entry.first,entry.second)){ok=false;break;}}
  const char *handler=event.kind==EventKind::Handler?event.handler.data():(event.kind==EventKind::Complete?"DATAMANAGER_OnReceiveTranComplete":(event.kind==EventKind::Error?"DATAMANAGER_OnReceiveTranError":"Form_OnFormClose"));
  if(ok)ok=callHandler(handler,event);endBudget();
  if(!ok||allocation_failed_||timed_out_||stage_limit_){const char *code=timed_out_?"EXECUTION_TIMEOUT":((allocation_failed_||stage_limit_)?"RESOURCE_LIMIT":(failure_code_?failure_code_:"LUA_ERROR"));stage_=nullptr;invalidate(event,code,internal);return false;}
  if(internal){Json close=Json::objectValue();close.object["type"]=Json::stringValue("closeForm");stage.commands.push_back(std::move(close));}
  const char *next=internal?"CLOSED":(stage.close_requested?"CLOSING":nullptr);std::string output;size_t state_bytes=0;
  if(!freeze(event,true,internal?Lifecycle::Closing:Lifecycle::Open,next,std::move(stage.commands),std::move(stage.diagnostics),committed_,&stage,output,&state_bytes)){stage_=nullptr;invalidate(event,"RESOURCE_LIMIT",internal);return false;}
  {
    std::lock_guard<std::mutex> lock(mutex_);uint32_t commit_failure=2;if(native_failure_.compare_exchange_strong(commit_failure,0))throw std::bad_alloc();for(const auto &token:stage.tokens)if(tokens_.count(token.first))throw std::bad_alloc();tokens_.merge(stage.tokens);if(!stage.tokens.empty())throw std::bad_alloc();
    for(auto it=committed_.data.begin();it!=committed_.data.end();)it=stage.cleared_transactions.count(it->first.transaction)?committed_.data.erase(it):std::next(it);
    while(!stage.data.empty()){auto node=stage.data.extract(stage.data.begin());committed_.data.erase(node.key());committed_.data.insert(std::move(node));}
    for(auto &control:stage.controls){auto found=committed_.controls.find(control.first);if(found==committed_.controls.end())continue;for(auto &property:control.second){auto value=found->second.properties.find(property.first);if(value!=found->second.properties.end())value->second=std::move(property.second);}}
    committed_bytes_=state_bytes;outstanding_tokens_.store(tokens_.size(),std::memory_order_release);issued_token_=std::max(issued_token_,stage.maximum_token);published_revision_=event.revision;last_staged_bytes_=stage.charged;token_commit_copied_bytes_=0;
  }
  deliver(output);
  if(internal){std::lock_guard<std::mutex> lock(mutex_);lifecycle_=Lifecycle::Closed;clearPendingLocked();cancelTokensLocked();}
  else if(stage.close_requested){std::lock_guard<std::mutex> lock(mutex_);lifecycle_=Lifecycle::Closing;clearPendingLocked();cancelTokensLocked();admission_revision_=event.revision;}
  stage_=nullptr;
  if(internal){closeLua();releaseContext();removeRegistry();}
  return true;
}

void Runtime::workerMain() {
  worker_id_=std::this_thread::get_id(); uint32_t code=ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;ArenaBudget arena;arena.charge(config_bytes_.size());
  if(parseConfig(config_bytes_.data(),config_bytes_.size(),config_,code,arena)) {
    size_t copy_charge=kContainerCharge;for(const auto &control:config_.controls){copy_charge+=control.first.size()+control.second.type.size()+kContainerCharge;for(const auto &property:control.second.properties)copy_charge+=property.first.size()+(property.second.kind==Scalar::Kind::String?property.second.string.size():sizeof(Scalar))+kContainerCharge;}
    if(!arena.charge(copy_charge))code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;else committed_.controls=config_.controls; std::string encoded; Json initial=hostStateJson(committed_);
    if(code==ALLNEWMTS_RUNTIME_OK){if(!encodeJson(initial,encoded,kCommittedBytes))code=ALLNEWMTS_RUNTIME_RESOURCE_LIMIT;else{committed_bytes_=encoded.size();loadEntry(code);}}
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
  uint64_t id=0; if(!allocateIdentifier(next_runtime_id,id))return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,0,0};
  size_t allocator_limit=kAllocatorBytes;
#ifdef ALLNEWMTS_RUNTIME_TESTING
  allocator_limit=next_allocator_limit.exchange(kAllocatorBytes);
#endif
  std::vector<uint8_t> bytes(config_json,config_json+config_json_size); auto runtime=std::make_shared<Runtime>(id,std::move(bytes),sink,release_context,context,allocator_limit);
  uint32_t code=runtime->start(); if(code!=ALLNEWMTS_RUNTIME_OK)return {code,0,0};
  try { std::lock_guard<std::mutex> lock(registry_mutex);if(!registry.emplace(id,runtime).second){runtime->destroy();return {ALLNEWMTS_RUNTIME_RESOURCE_LIMIT,0,0};} }
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
  std::shared_ptr<Runtime> runtime; {std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return {ALLNEWMTS_RUNTIME_NOT_FOUND,runtime_id,0};runtime=found->second;if(runtime->workerThread())return {ALLNEWMTS_RUNTIME_REENTRANT_CALL,runtime_id,0};registry.erase(found);}
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
extern "C" void allnewmts_runtime_test_next_lua_allocator_limit(size_t bytes){next_allocator_limit.store(bytes);}
extern "C" int allnewmts_runtime_test_lua_allocator_limit(uint64_t runtime_id,size_t bytes){std::shared_ptr<Runtime> runtime;{std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return 0;runtime=found->second;}runtime->setAllocatorLimit(bytes);return 1;}
extern "C" int allnewmts_runtime_test_fail_next_native_allocation(uint64_t runtime_id,uint32_t phase){if(phase!=1&&phase!=2)return 0;std::shared_ptr<Runtime> runtime;{std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return 0;runtime=found->second;}runtime->failNextNativeAllocation(phase);return 1;}
extern "C" int allnewmts_runtime_test_instruction_limit_exceeded(uint64_t instructions){return instructionLimitExceeded(instructions)?1:0;}
extern "C" int allnewmts_runtime_test_stage_charge(size_t charged,size_t bytes,size_t *result){if(!result||charged>kStageBytes)return 0;Stage stage;stage.charged=charged;if(!stage.charge(bytes))return 0;*result=stage.charged;return 1;}
extern "C" void allnewmts_runtime_test_set_next_runtime_id(uint64_t next_id){next_runtime_id.store(next_id);}
extern "C" void allnewmts_runtime_test_set_next_token_id(uint64_t next_id){next_token_id.store(next_id);}
extern "C" int allnewmts_runtime_test_pause_next_request(uint64_t runtime_id){std::shared_ptr<Runtime> runtime;{std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return 0;runtime=found->second;}runtime->armRequestPause();return 1;}
extern "C" int allnewmts_runtime_test_wait_request_prepared(uint64_t runtime_id){std::shared_ptr<Runtime> runtime;{std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return 0;runtime=found->second;}return runtime->waitRequestPrepared()?1:0;}
extern "C" int allnewmts_runtime_test_resume_request(uint64_t runtime_id){std::shared_ptr<Runtime> runtime;{std::lock_guard<std::mutex> lock(registry_mutex);auto found=registry.find(runtime_id);if(found==registry.end())return 0;runtime=found->second;}runtime->resumeRequest();return 1;}
#endif

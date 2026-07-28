#include "allnewmts_rest_auth.h"

#include <array>
#include <condition_variable>
#include <cstring>
#include <limits>
#include <mutex>
#include <new>
#include <string>
#include <string_view>
#include <vector>

namespace {

constexpr std::array<uint32_t, ALLNEWMTS_REST_AUTH_ROUNDS> kTimeouts = {
    15000, 20000, 30000, 45000};
constexpr std::string_view kAccessKeyPath = "/clientAuth";
constexpr std::string_view kAccessTokenPath = "/clientAccessToken";

void wipe(void *value, size_t size) {
  volatile uint8_t *bytes = static_cast<volatile uint8_t *>(value);
  while (size--) *bytes++ = 0;
}

bool identifier(const char *value, size_t maximum) {
  if (!value) return false;
  const size_t size = std::strlen(value);
  if (size == 0 || size > maximum) return false;
  for (size_t index = 0; index < size; ++index) {
    const unsigned char byte = static_cast<unsigned char>(value[index]);
    if ((byte < 'A' || byte > 'Z') && (byte < 'a' || byte > 'z') &&
        (byte < '0' || byte > '9') && byte != '_' && byte != '-')
      return false;
  }
  return true;
}

bool printable(const char *value, size_t maximum) {
  if (!value) return false;
  const size_t size = std::strlen(value);
  if (size == 0 || size > maximum) return false;
  for (size_t index = 0; index < size; ++index) {
    const unsigned char byte = static_cast<unsigned char>(value[index]);
    if (byte < 0x21 || byte > 0x7e) return false;
  }
  return true;
}

bool printable(std::string_view value) {
  if (value.empty()) return false;
  for (unsigned char byte : value)
    if (byte < 0x21 || byte > 0x7e) return false;
  return true;
}

bool validUtf8(std::string_view text) {
  size_t index = 0;
  while (index < text.size()) {
    const unsigned char first = static_cast<unsigned char>(text[index++]);
    if (first < 0x80) continue;
    int remaining = 0;
    uint32_t value = 0;
    if ((first & 0xe0) == 0xc0) {
      remaining = 1;
      value = first & 0x1f;
      if (value < 2) return false;
    } else if ((first & 0xf0) == 0xe0) {
      remaining = 2;
      value = first & 0x0f;
    } else if ((first & 0xf8) == 0xf0) {
      remaining = 3;
      value = first & 0x07;
    } else {
      return false;
    }
    if (index + static_cast<size_t>(remaining) > text.size()) return false;
    for (int current = 0; current < remaining; ++current) {
      const unsigned char next = static_cast<unsigned char>(text[index++]);
      if ((next & 0xc0) != 0x80) return false;
      value = (value << 6) | (next & 0x3f);
    }
    if ((remaining == 2 && value < 0x800) ||
        (remaining == 3 && value < 0x10000) || value > 0x10ffff ||
        (value >= 0xd800 && value <= 0xdfff))
      return false;
  }
  return true;
}

void appendUtf8(std::string &output, uint32_t value) {
  if (value <= 0x7f) {
    output.push_back(static_cast<char>(value));
  } else if (value <= 0x7ff) {
    output.push_back(static_cast<char>(0xc0 | (value >> 6)));
    output.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  } else if (value <= 0xffff) {
    output.push_back(static_cast<char>(0xe0 | (value >> 12)));
    output.push_back(static_cast<char>(0x80 | ((value >> 6) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  } else {
    output.push_back(static_cast<char>(0xf0 | (value >> 18)));
    output.push_back(static_cast<char>(0x80 | ((value >> 12) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | ((value >> 6) & 0x3f)));
    output.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  }
}

enum class CredentialParse { Accepted, Rejected, Invalid };
enum class TransactionParse { Accepted, Unauthorized, Rejected, Invalid };

class ResponseParser {
 public:
  ResponseParser(const uint8_t *bytes, size_t size)
      : input_(reinterpret_cast<const char *>(bytes), size) {}

  CredentialParse credential(std::string_view field, std::string &output) {
    skipWhitespace();
    if (!take('{')) return CredentialParse::Invalid;
    skipWhitespace();
    bool found = false, status_found = false;
    int status = 0;
    size_t fields = 0;
    if (!peek('}')) {
      for (;;) {
        if (++fields > 32) return CredentialParse::Invalid;
        std::string key;
        if (!string(key, 64)) return CredentialParse::Invalid;
        skipWhitespace();
        if (!take(':')) return CredentialParse::Invalid;
        skipWhitespace();
        if (key == "status") {
          if (status_found || !integer(status))
            return CredentialParse::Invalid;
          status_found = true;
        } else if (key == field) {
          if (found ||
              !string(output, field == "access_key"
                                  ? ALLNEWMTS_REST_AUTH_MAX_ACCESS_KEY_SIZE - 1
                                  : ALLNEWMTS_REST_AUTH_MAX_ACCESS_TOKEN_SIZE -
                                        1))
            return CredentialParse::Invalid;
          found = true;
        } else if (!skipValue(0)) {
          return CredentialParse::Invalid;
        }
        skipWhitespace();
        if (take('}')) break;
        if (!take(',')) return CredentialParse::Invalid;
        skipWhitespace();
      }
    } else {
      ++position_;
    }
    skipWhitespace();
    if (position_ != input_.size()) return CredentialParse::Invalid;
    if (status_found && status != 0) return CredentialParse::Rejected;
    return found && printable(std::string_view(output))
               ? CredentialParse::Accepted
               : CredentialParse::Invalid;
  }

  TransactionParse transaction(
      const AllNewMTSRestTransactionSchema &schema,
      AllNewMTSRestTransactionOutput *outputs, uint16_t &status_output) {
    skipWhitespace();
    if (!take('{')) return TransactionParse::Invalid;
    skipWhitespace();
    bool status_found = false, result_found = false, output_found = false;
    int status = 0;
    std::string result_code;
    for (size_t fields = 0; !peek('}'); ++fields) {
      if (fields >= 64) return TransactionParse::Invalid;
      std::string key;
      if (!string(key, 64)) return TransactionParse::Invalid;
      skipWhitespace();
      if (!take(':')) return TransactionParse::Invalid;
      skipWhitespace();
      if (key == "status") {
        if (status_found || !integer(status)) return TransactionParse::Invalid;
        status_found = true;
      } else if (key == "resultCode") {
        if (result_found || !string(result_code, 64))
          return TransactionParse::Invalid;
        result_found = true;
      } else if (key == "outputData") {
        if (output_found || !outputData(schema, outputs))
          return TransactionParse::Invalid;
        output_found = true;
      } else if (!skipValue(0)) {
        return TransactionParse::Invalid;
      }
      skipWhitespace();
      if (peek('}')) break;
      if (!take(',')) return TransactionParse::Invalid;
      skipWhitespace();
    }
    if (!take('}')) return TransactionParse::Invalid;
    skipWhitespace();
    if (position_ != input_.size()) return TransactionParse::Invalid;
    if (status_found && (status == 401 || status == 403)) {
      status_output = static_cast<uint16_t>(status);
      return TransactionParse::Unauthorized;
    }
    if ((status_found && status != 0) || !result_found)
      return TransactionParse::Rejected;
    if (result_code != "00000000") return TransactionParse::Rejected;
    return output_found ? TransactionParse::Accepted
                        : TransactionParse::Invalid;
  }

 private:
  std::string_view input_;
  size_t position_ = 0;

  void skipWhitespace() {
    while (position_ < input_.size() &&
           (input_[position_] == ' ' || input_[position_] == '\t' ||
            input_[position_] == '\r' || input_[position_] == '\n'))
      ++position_;
  }

  bool peek(char value) const {
    return position_ < input_.size() && input_[position_] == value;
  }

  bool take(char value) {
    if (!peek(value)) return false;
    ++position_;
    return true;
  }

  bool literal(std::string_view value) {
    if (input_.substr(position_, value.size()) != value) return false;
    position_ += value.size();
    return true;
  }

  bool hex4(uint32_t &value) {
    value = 0;
    for (size_t index = 0; index < 4; ++index) {
      if (position_ >= input_.size()) return false;
      const char byte = input_[position_++];
      value <<= 4;
      if (byte >= '0' && byte <= '9')
        value |= static_cast<uint32_t>(byte - '0');
      else if (byte >= 'a' && byte <= 'f')
        value |= static_cast<uint32_t>(byte - 'a' + 10);
      else if (byte >= 'A' && byte <= 'F')
        value |= static_cast<uint32_t>(byte - 'A' + 10);
      else
        return false;
    }
    return true;
  }

  bool string(std::string &output, size_t maximum) {
    if (!take('"')) return false;
    output.clear();
    while (position_ < input_.size()) {
      const unsigned char byte =
          static_cast<unsigned char>(input_[position_++]);
      if (byte == '"') return !output.empty() && output.size() <= maximum;
      if (byte < 0x20 || output.size() >= maximum) return false;
      if (byte != '\\') {
        output.push_back(static_cast<char>(byte));
        continue;
      }
      if (position_ >= input_.size()) return false;
      const char escaped = input_[position_++];
      if (escaped == '"' || escaped == '\\' || escaped == '/')
        output.push_back(escaped);
      else if (escaped == 'b')
        output.push_back('\b');
      else if (escaped == 'f')
        output.push_back('\f');
      else if (escaped == 'n')
        output.push_back('\n');
      else if (escaped == 'r')
        output.push_back('\r');
      else if (escaped == 't')
        output.push_back('\t');
      else if (escaped == 'u') {
        uint32_t value = 0;
        if (!hex4(value) || value > 0x7f) return false;
        output.push_back(static_cast<char>(value));
      } else {
        return false;
      }
    }
    return false;
  }

  bool unicodeString(std::string &output, size_t maximum) {
    if (!take('"')) return false;
    output.clear();
    while (position_ < input_.size()) {
      const unsigned char byte =
          static_cast<unsigned char>(input_[position_++]);
      if (byte == '"') return output.size() <= maximum && validUtf8(output);
      if (byte < 0x20) return false;
      if (byte != '\\') {
        if (output.size() >= maximum) return false;
        output.push_back(static_cast<char>(byte));
        continue;
      }
      if (position_ >= input_.size()) return false;
      const char escaped = input_[position_++];
      uint32_t value = 0;
      if (escaped == '"' || escaped == '\\' || escaped == '/') {
        value = static_cast<unsigned char>(escaped);
      } else if (escaped == 'b') {
        value = '\b';
      } else if (escaped == 'f') {
        value = '\f';
      } else if (escaped == 'n') {
        value = '\n';
      } else if (escaped == 'r') {
        value = '\r';
      } else if (escaped == 't') {
        value = '\t';
      } else if (escaped == 'u') {
        if (!hex4(value) || value == 0) return false;
        if (value >= 0xd800 && value <= 0xdbff) {
          uint32_t low = 0;
          if (!take('\\') || !take('u') || !hex4(low) || low < 0xdc00 ||
              low > 0xdfff)
            return false;
          value = 0x10000 + ((value - 0xd800) << 10) + low - 0xdc00;
        } else if (value >= 0xdc00 && value <= 0xdfff) {
          return false;
        }
      } else {
        return false;
      }
      const size_t before = output.size();
      appendUtf8(output, value);
      if (output.size() < before || output.size() > maximum) return false;
    }
    return false;
  }

  bool skipString() {
    if (!take('"')) return false;
    while (position_ < input_.size()) {
      const unsigned char byte =
          static_cast<unsigned char>(input_[position_++]);
      if (byte == '"') return true;
      if (byte < 0x20) return false;
      if (byte != '\\') continue;
      if (position_ >= input_.size()) return false;
      const char escaped = input_[position_++];
      if (escaped == 'u') {
        uint32_t ignored = 0;
        if (!hex4(ignored)) return false;
      } else if (escaped != '"' && escaped != '\\' && escaped != '/' &&
                 escaped != 'b' && escaped != 'f' && escaped != 'n' &&
                 escaped != 'r' && escaped != 't') {
        return false;
      }
    }
    return false;
  }

  bool integer(int &output) {
    bool negative = take('-');
    if (position_ >= input_.size()) return false;
    int value = 0;
    size_t digits = 0;
    while (position_ < input_.size() && input_[position_] >= '0' &&
           input_[position_] <= '9') {
      if (++digits > 9) return false;
      value = value * 10 + input_[position_++] - '0';
    }
    if (digits == 0) return false;
    output = negative ? -value : value;
    return true;
  }

  bool skipNumber() {
    const size_t start = position_;
    take('-');
    if (position_ >= input_.size()) return false;
    if (input_[position_] == '0') {
      ++position_;
    } else {
      if (input_[position_] < '1' || input_[position_] > '9') return false;
      while (position_ < input_.size() && input_[position_] >= '0' &&
             input_[position_] <= '9')
        ++position_;
    }
    if (take('.')) {
      const size_t digits = position_;
      while (position_ < input_.size() && input_[position_] >= '0' &&
             input_[position_] <= '9')
        ++position_;
      if (digits == position_) return false;
    }
    if (position_ < input_.size() &&
        (input_[position_] == 'e' || input_[position_] == 'E')) {
      ++position_;
      if (position_ < input_.size() &&
          (input_[position_] == '+' || input_[position_] == '-'))
        ++position_;
      const size_t digits = position_;
      while (position_ < input_.size() && input_[position_] >= '0' &&
             input_[position_] <= '9')
        ++position_;
      if (digits == position_) return false;
    }
    return position_ > start;
  }

  bool skipValue(size_t depth) {
    if (depth > 8 || position_ >= input_.size()) return false;
    if (peek('"')) return skipString();
    if (peek('-') || (input_[position_] >= '0' && input_[position_] <= '9'))
      return skipNumber();
    if (literal("true") || literal("false") || literal("null")) return true;
    if (take('[')) {
      skipWhitespace();
      if (take(']')) return true;
      for (size_t count = 0; count < 64; ++count) {
        if (!skipValue(depth + 1)) return false;
        skipWhitespace();
        if (take(']')) return true;
        if (!take(',')) return false;
        skipWhitespace();
      }
      return false;
    }
    if (take('{')) {
      skipWhitespace();
      if (take('}')) return true;
      for (size_t count = 0; count < 64; ++count) {
        if (!skipString()) return false;
        skipWhitespace();
        if (!take(':')) return false;
        skipWhitespace();
        if (!skipValue(depth + 1)) return false;
        skipWhitespace();
        if (take('}')) return true;
        if (!take(',')) return false;
        skipWhitespace();
      }
    }
    return false;
  }

  bool outputData(const AllNewMTSRestTransactionSchema &schema,
                  AllNewMTSRestTransactionOutput *outputs) {
    if (!take('{')) return false;
    skipWhitespace();
    const std::string expected =
        std::string(1, static_cast<char>(
                           schema.output_block[0] >= 'A' &&
                                   schema.output_block[0] <= 'Z'
                               ? schema.output_block[0] - 'A' + 'a'
                               : schema.output_block[0])) +
        (schema.output_block + 1);
    bool found = false;
    for (size_t fields = 0; !peek('}'); ++fields) {
      if (fields >= ALLNEWMTS_REST_TRANSACTION_MAX_FIELDS) return false;
      std::string key;
      if (!string(key, 128)) return false;
      skipWhitespace();
      if (!take(':')) return false;
      skipWhitespace();
      if (key == expected) {
        if (found || !outputBlock(schema, outputs)) return false;
        found = true;
      } else if (!skipValue(1)) {
        return false;
      }
      skipWhitespace();
      if (peek('}')) break;
      if (!take(',')) return false;
      skipWhitespace();
    }
    return take('}') && found;
  }

  bool outputBlock(const AllNewMTSRestTransactionSchema &schema,
                   AllNewMTSRestTransactionOutput *outputs) {
    if (!take('{')) return false;
    skipWhitespace();
    for (size_t fields = 0; !peek('}'); ++fields) {
      if (fields >= ALLNEWMTS_REST_TRANSACTION_MAX_FIELDS) return false;
      std::string key;
      if (!string(key, 128)) return false;
      skipWhitespace();
      if (!take(':')) return false;
      skipWhitespace();
      size_t index = schema.output_field_count;
      // ponytail: linear matching is enough for <=1024 schema fields.
      for (size_t current = 0; current < schema.output_field_count; ++current)
        if (key == schema.output_fields[current].name) {
          index = current;
          break;
        }
      if (index == schema.output_field_count) {
        if (!skipValue(2)) return false;
      } else {
        if (outputs[index].present) return false;
        std::string value;
        if (!unicodeString(value, schema.output_fields[index].maximum_size))
          return false;
        std::memcpy(outputs[index].value, value.data(), value.size());
        outputs[index].value[value.size()] = '\0';
        outputs[index].value_size = value.size();
        outputs[index].present = 1;
      }
      skipWhitespace();
      if (peek('}')) break;
      if (!take(',')) return false;
      skipWhitespace();
    }
    return take('}');
  }
};

bool fresh(const AllNewMTSRestCredentials &credentials, uint64_t now) {
  return credentials.generation != 0 && now >= credentials.issued_at_ms &&
         now - credentials.issued_at_ms < ALLNEWMTS_REST_AUTH_FRESH_MS;
}

}  // namespace

struct AllNewMTSRestAuth {
  std::string channel_detail;
  std::string client_id;
  std::string auth_key;
  std::string hts_id;
  AllNewMTSRestAuthTransport transport{};
  void *context = nullptr;
  std::mutex mutex;
  std::condition_variable condition;
  bool issuing = false;
  bool closing = false;
  size_t active_transactions = 0;
  uint64_t issue_sequence = 0;
  uint64_t completed_sequence = 0;
  uint64_t generation = 0;
  uint32_t last_result = ALLNEWMTS_REST_AUTH_NOT_READY;
  AllNewMTSRestCredentials credentials{};
};

namespace {

void clearCredentials(AllNewMTSRestCredentials &credentials) {
  wipe(&credentials, sizeof(credentials));
}

uint32_t requestCredential(AllNewMTSRestAuth *manager, std::string_view path,
                           const char *field, const char *access_key,
                           uint32_t timeout, char *output,
                           size_t output_capacity) {
  std::string body = "{\"client_id\":\"" + manager->client_id + "\"}";
  std::array<AllNewMTSRestAuthHeader, 7> headers = {{
      {"Content-Type", "application/json"},
      {"H_CHNL_DETL_SCD", manager->channel_detail.c_str()},
      {"auth_key", manager->auth_key.c_str()},
      {"connection", "keep-alive"},
      {"content-language", "ko-KR"},
      {"h_hts_id", manager->hts_id.c_str()},
      {"access_key", access_key},
  }};
  const size_t header_count = access_key ? headers.size() : headers.size() - 1;
  const std::string path_text(path);
  const AllNewMTSRestAuthRequest request{
      path_text.c_str(),
      headers.data(),
      header_count,
      reinterpret_cast<const uint8_t *>(body.data()),
      body.size(),
      timeout,
  };
  std::array<uint8_t, ALLNEWMTS_REST_AUTH_MAX_RESPONSE_SIZE> response{};
  uint16_t http_status = 0;
  size_t response_size = 0;
  if (!manager->transport.post(manager->context, &request, &http_status,
                               response.data(), response.size(),
                               &response_size)) {
    wipe(response.data(), response.size());
    return ALLNEWMTS_REST_AUTH_TRANSPORT_ERROR;
  }
  if (response_size > response.size() || http_status < 200 ||
      http_status >= 300) {
    wipe(response.data(), response.size());
    return response_size > response.size() ? ALLNEWMTS_REST_AUTH_RESPONSE_INVALID
                                           : ALLNEWMTS_REST_AUTH_HTTP_ERROR;
  }
  std::string credential;
  ResponseParser parser(response.data(), response_size);
  const CredentialParse parsed = parser.credential(field, credential);
  wipe(response.data(), response.size());
  if (parsed != CredentialParse::Accepted) {
    if (!credential.empty()) wipe(credential.data(), credential.size());
    return parsed == CredentialParse::Rejected
               ? ALLNEWMTS_REST_AUTH_REJECTED
               : ALLNEWMTS_REST_AUTH_RESPONSE_INVALID;
  }
  if (credential.size() + 1 > output_capacity) {
    wipe(credential.data(), credential.size());
    return ALLNEWMTS_REST_AUTH_RESPONSE_INVALID;
  }
  std::memcpy(output, credential.c_str(), credential.size() + 1);
  wipe(credential.data(), credential.size());
  return ALLNEWMTS_REST_AUTH_OK;
}

uint32_t issue(AllNewMTSRestAuth *manager,
               AllNewMTSRestCredentials &candidate) {
  uint32_t last = ALLNEWMTS_REST_AUTH_TRANSPORT_ERROR;
  for (uint32_t round = 0; round < ALLNEWMTS_REST_AUTH_ROUNDS; ++round) {
    clearCredentials(candidate);
    last = requestCredential(
        manager, kAccessKeyPath, "access_key", nullptr, kTimeouts[round],
        candidate.access_key, sizeof(candidate.access_key));
    if (last != ALLNEWMTS_REST_AUTH_OK) continue;
    last = requestCredential(
        manager, kAccessTokenPath, "access_token", candidate.access_key,
        kTimeouts[round], candidate.access_token,
        sizeof(candidate.access_token));
    if (last == ALLNEWMTS_REST_AUTH_OK) return last;
  }
  clearCredentials(candidate);
  return last;
}

uint32_t copyFresh(AllNewMTSRestAuth *manager,
                   AllNewMTSRestCredentials *output) {
  const uint64_t now = manager->transport.now_ms(manager->context);
  if (!fresh(manager->credentials, now))
    return ALLNEWMTS_REST_AUTH_NOT_READY;
  *output = manager->credentials;
  return ALLNEWMTS_REST_AUTH_OK;
}

bool transactionFields(const AllNewMTSRestTransactionField *fields,
                       size_t count) {
  if (count > ALLNEWMTS_REST_TRANSACTION_MAX_FIELDS ||
      (count != 0 && !fields))
    return false;
  for (size_t index = 0; index < count; ++index) {
    if (!identifier(fields[index].name, 128) ||
        fields[index].maximum_size == 0 ||
        fields[index].maximum_size >
            ALLNEWMTS_REST_TRANSACTION_MAX_BODY_SIZE)
      return false;
    for (size_t previous = 0; previous < index; ++previous)
      if (std::strcmp(fields[previous].name, fields[index].name) == 0)
        return false;
  }
  return true;
}

bool transactionSchema(const AllNewMTSRestTransactionSchema *schema) {
  return schema && identifier(schema->transaction_id, 128) &&
         std::strlen(schema->transaction_id) >= 2 &&
         identifier(schema->input_block, 128) &&
         identifier(schema->output_block, 128) &&
         transactionFields(schema->input_fields, schema->input_field_count) &&
         schema->output_field_count != 0 &&
         transactionFields(schema->output_fields,
                           schema->output_field_count) &&
         (schema->read_only == 0 || schema->read_only == 1);
}

void clearOutputs(AllNewMTSRestTransactionOutput *outputs, size_t count) {
  if (!outputs) return;
  for (size_t index = 0; index < count; ++index) {
    if (outputs[index].value && outputs[index].value_capacity)
      outputs[index].value[0] = '\0';
    outputs[index].value_size = 0;
    outputs[index].present = 0;
  }
}

bool transactionBindings(
    const AllNewMTSRestTransactionSchema &schema,
    const AllNewMTSRestTransactionInput *inputs, size_t input_count,
    AllNewMTSRestTransactionOutput *outputs, size_t output_count) {
  if (input_count != schema.input_field_count ||
      output_count != schema.output_field_count ||
      (input_count != 0 && !inputs) || !outputs)
    return false;
  for (size_t index = 0; index < input_count; ++index) {
    if (!identifier(inputs[index].name, 128) ||
        (!inputs[index].value && inputs[index].value_size != 0) ||
        !validUtf8(std::string_view(
            inputs[index].value
                ? reinterpret_cast<const char *>(inputs[index].value)
                : "",
            inputs[index].value_size)))
      return false;
    size_t matches = 0;
    for (size_t field = 0; field < schema.input_field_count; ++field)
      if (std::strcmp(inputs[index].name, schema.input_fields[field].name) ==
          0) {
        if (inputs[index].value_size >
            schema.input_fields[field].maximum_size)
          return false;
        ++matches;
      }
    if (matches != 1) return false;
    for (size_t previous = 0; previous < index; ++previous)
      if (std::strcmp(inputs[previous].name, inputs[index].name) == 0)
        return false;
  }
  for (size_t index = 0; index < output_count; ++index)
    if (!outputs[index].name ||
        std::strcmp(outputs[index].name,
                    schema.output_fields[index].name) != 0 ||
        !outputs[index].value ||
        outputs[index].value_capacity <=
            schema.output_fields[index].maximum_size)
      return false;
  return true;
}

bool appendJsonString(std::string_view value, std::string &output) {
  static constexpr char kHex[] = "0123456789abcdef";
  if (!validUtf8(value)) return false;
  output.push_back('"');
  for (unsigned char byte : value) {
    if (byte == '"' || byte == '\\') {
      output.push_back('\\');
      output.push_back(static_cast<char>(byte));
    } else if (byte == '\b') {
      output += "\\b";
    } else if (byte == '\f') {
      output += "\\f";
    } else if (byte == '\n') {
      output += "\\n";
    } else if (byte == '\r') {
      output += "\\r";
    } else if (byte == '\t') {
      output += "\\t";
    } else if (byte < 0x20) {
      output += "\\u00";
      output.push_back(kHex[byte >> 4]);
      output.push_back(kHex[byte & 0x0f]);
    } else {
      output.push_back(static_cast<char>(byte));
    }
    if (output.size() > ALLNEWMTS_REST_TRANSACTION_MAX_BODY_SIZE)
      return false;
  }
  output.push_back('"');
  return output.size() <= ALLNEWMTS_REST_TRANSACTION_MAX_BODY_SIZE;
}

bool buildTransactionBody(
    const AllNewMTSRestTransactionSchema &schema,
    const AllNewMTSRestTransactionInput *inputs, std::string &body) {
  body.clear();
  body.push_back('{');
  for (size_t field = 0; field < schema.input_field_count; ++field) {
    const AllNewMTSRestTransactionInput *input = nullptr;
    for (size_t index = 0; index < schema.input_field_count; ++index)
      if (std::strcmp(inputs[index].name, schema.input_fields[field].name) ==
          0) {
        input = &inputs[index];
        break;
      }
    if (!input) return false;
    if (field) body.push_back(',');
    if (!appendJsonString(schema.input_fields[field].name, body))
      return false;
    body.push_back(':');
    if (!appendJsonString(
            std::string_view(input->value
                                 ? reinterpret_cast<const char *>(input->value)
                                 : "",
                             input->value_size),
            body))
      return false;
  }
  body.push_back('}');
  return body.size() <= ALLNEWMTS_REST_TRANSACTION_MAX_BODY_SIZE;
}

}  // namespace

extern "C" uint32_t allnewmts_rest_auth_create(
    const char channel_detail[6], const char *client_id, const char *auth_key,
    const char *hts_id, const AllNewMTSRestAuthTransport *transport,
    void *context, AllNewMTSRestAuth **manager) {
  if (!channel_detail || std::strlen(channel_detail) != 5 ||
      channel_detail[0] != 'C' || channel_detail[1] != 'C' ||
      channel_detail[2] < '0' || channel_detail[2] > '9' ||
      channel_detail[3] < '0' || channel_detail[3] > '9' ||
      channel_detail[4] < '0' || channel_detail[4] > '9' ||
      !identifier(client_id, 64) || !printable(auth_key, 256) ||
      !identifier(hts_id, 10) || !transport || !transport->post ||
      !transport->now_ms || !manager)
    return ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT;
  AllNewMTSRestAuth *created = nullptr;
  try {
    created = new (std::nothrow) AllNewMTSRestAuth();
    if (!created) return ALLNEWMTS_REST_AUTH_RESOURCE_LIMIT;
    created->channel_detail = channel_detail;
    created->client_id = client_id;
    created->auth_key = auth_key;
    created->hts_id = hts_id;
    created->transport = *transport;
    created->context = context;
    *manager = created;
    return ALLNEWMTS_REST_AUTH_OK;
  } catch (const std::bad_alloc &) {
    delete created;
    return ALLNEWMTS_REST_AUTH_RESOURCE_LIMIT;
  }
}

extern "C" uint32_t allnewmts_rest_auth_prepare(
    AllNewMTSRestAuth *manager, int force_issue,
    AllNewMTSRestCredentials *credentials) {
  if (!manager || !credentials || (force_issue != 0 && force_issue != 1))
    return ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT;
  std::unique_lock<std::mutex> lock(manager->mutex);
  if (manager->closing) return ALLNEWMTS_REST_AUTH_NOT_READY;
  if (!force_issue &&
      copyFresh(manager, credentials) == ALLNEWMTS_REST_AUTH_OK)
    return ALLNEWMTS_REST_AUTH_OK;
  if (manager->issuing) {
    const uint64_t sequence = manager->issue_sequence;
    manager->condition.wait(lock, [manager, sequence] {
      return !manager->issuing && manager->completed_sequence >= sequence;
    });
    if (manager->last_result != ALLNEWMTS_REST_AUTH_OK)
      return manager->last_result;
    return copyFresh(manager, credentials);
  }
  manager->issuing = true;
  ++manager->issue_sequence;
  clearCredentials(manager->credentials);
  lock.unlock();

  AllNewMTSRestCredentials candidate{};
  uint32_t result = ALLNEWMTS_REST_AUTH_RESOURCE_LIMIT;
  try {
    result = issue(manager, candidate);
  } catch (const std::bad_alloc &) {
    result = ALLNEWMTS_REST_AUTH_RESOURCE_LIMIT;
  }
  const uint64_t issued_at =
      result == ALLNEWMTS_REST_AUTH_OK
          ? manager->transport.now_ms(manager->context)
          : 0;

  lock.lock();
  if (result == ALLNEWMTS_REST_AUTH_OK &&
      manager->generation == std::numeric_limits<uint64_t>::max())
    result = ALLNEWMTS_REST_AUTH_RESOURCE_LIMIT;
  if (result == ALLNEWMTS_REST_AUTH_OK) {
    candidate.generation = ++manager->generation;
    candidate.issued_at_ms = issued_at;
    manager->credentials = candidate;
    *credentials = manager->credentials;
  } else {
    clearCredentials(manager->credentials);
  }
  clearCredentials(candidate);
  manager->last_result = result;
  manager->completed_sequence = manager->issue_sequence;
  manager->issuing = false;
  lock.unlock();
  manager->condition.notify_all();
  return result;
}

extern "C" uint32_t allnewmts_rest_auth_unauthorized(
    AllNewMTSRestAuth *manager, uint64_t credential_generation,
    uint16_t http_status, AllNewMTSRestCredentials *credentials) {
  if (!manager || !credentials || credential_generation == 0 ||
      (http_status != 401 && http_status != 403))
    return ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT;
  {
    std::lock_guard<std::mutex> lock(manager->mutex);
    if (manager->closing) return ALLNEWMTS_REST_AUTH_NOT_READY;
    if (manager->credentials.generation != credential_generation &&
        copyFresh(manager, credentials) == ALLNEWMTS_REST_AUTH_OK)
      return ALLNEWMTS_REST_AUTH_OK;
  }
  return allnewmts_rest_auth_prepare(manager, 1, credentials);
}

extern "C" uint32_t allnewmts_rest_auth_snapshot(
    AllNewMTSRestAuth *manager, AllNewMTSRestCredentials *credentials) {
  if (!manager || !credentials)
    return ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT;
  std::lock_guard<std::mutex> lock(manager->mutex);
  return manager->issuing || manager->closing
             ? ALLNEWMTS_REST_AUTH_NOT_READY
             : copyFresh(manager, credentials);
}

extern "C" uint32_t allnewmts_rest_transaction_call(
    AllNewMTSRestAuth *manager,
    const AllNewMTSRestTransactionSchema *schema,
    const AllNewMTSRestTransactionInput *inputs, size_t input_count,
    const char *screen_filename, AllNewMTSRestTransactionOutput *outputs,
    size_t output_count) {
  if (!manager || !transactionSchema(schema) ||
      !transactionBindings(*schema, inputs, input_count, outputs,
                           output_count) ||
      (screen_filename && *screen_filename &&
       !printable(screen_filename, 256)))
    return ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT;
  {
    std::lock_guard<std::mutex> lock(manager->mutex);
    if (manager->closing) return ALLNEWMTS_REST_AUTH_NOT_READY;
    ++manager->active_transactions;
  }
  clearOutputs(outputs, output_count);

  std::string body;
  std::vector<uint8_t> response;
  AllNewMTSRestCredentials credentials{};
  auto finish = [&](uint32_t result) {
    if (result != ALLNEWMTS_REST_AUTH_OK) clearOutputs(outputs, output_count);
    clearCredentials(credentials);
    if (!body.empty()) wipe(body.data(), body.size());
    if (!response.empty()) wipe(response.data(), response.size());
    {
      std::lock_guard<std::mutex> lock(manager->mutex);
      --manager->active_transactions;
    }
    manager->condition.notify_all();
    return result;
  };

  try {
    if (!buildTransactionBody(*schema, inputs, body))
      return finish(ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT);
    response.resize(ALLNEWMTS_REST_TRANSACTION_MAX_RESPONSE_SIZE);
    uint32_t result = allnewmts_rest_auth_prepare(manager, 0, &credentials);
    if (result != ALLNEWMTS_REST_AUTH_OK) return finish(result);

    std::string path = "/";
    for (size_t index = 0; index < 2; ++index) {
      const char value = schema->transaction_id[index];
      path.push_back(value >= 'A' && value <= 'Z' ? value - 'A' + 'a'
                                                  : value);
    }
    path += "/";
    path += schema->transaction_id;

    for (size_t attempt = 0; attempt < 2; ++attempt) {
      clearOutputs(outputs, output_count);
      std::array<AllNewMTSRestAuthHeader, 8> headers = {{
          {"Content-Type", "application/json"},
          {"H_CHNL_DETL_SCD", manager->channel_detail.c_str()},
          {"auth_key", manager->auth_key.c_str()},
          {"connection", "keep-alive"},
          {"content-language", "ko-KR"},
          {"h_hts_id", manager->hts_id.c_str()},
          {"authorization", credentials.access_token},
          {"H_SCREEN_FILENAME", screen_filename},
      }};
      const size_t header_count =
          screen_filename && *screen_filename ? headers.size()
                                              : headers.size() - 1;
      const AllNewMTSRestAuthRequest request{
          path.c_str(),
          headers.data(),
          header_count,
          reinterpret_cast<const uint8_t *>(body.data()),
          body.size(),
          ALLNEWMTS_REST_TRANSACTION_TIMEOUT_MS,
      };
      uint16_t http_status = 0;
      size_t response_size = 0;
      if (!manager->transport.post(manager->context, &request, &http_status,
                                   response.data(), response.size(),
                                   &response_size))
        return finish(ALLNEWMTS_REST_AUTH_TRANSPORT_ERROR);
      if (response_size > response.size())
        return finish(ALLNEWMTS_REST_AUTH_RESPONSE_INVALID);

      uint16_t unauthorized_status = 0;
      TransactionParse parsed = TransactionParse::Invalid;
      if (http_status == 401 || http_status == 403) {
        unauthorized_status = http_status;
      } else if (http_status < 200 || http_status >= 300) {
        return finish(ALLNEWMTS_REST_AUTH_HTTP_ERROR);
      } else if (!validUtf8(std::string_view(
                     reinterpret_cast<const char *>(response.data()),
                     response_size))) {
        return finish(ALLNEWMTS_REST_AUTH_RESPONSE_INVALID);
      } else {
        ResponseParser parser(response.data(), response_size);
        parsed = parser.transaction(*schema, outputs, unauthorized_status);
      }

      if (unauthorized_status != 0 ||
          parsed == TransactionParse::Unauthorized) {
        clearOutputs(outputs, output_count);
        if (attempt != 0) return finish(ALLNEWMTS_REST_AUTH_HTTP_ERROR);
        AllNewMTSRestCredentials renewed{};
        result = allnewmts_rest_auth_unauthorized(
            manager, credentials.generation, unauthorized_status, &renewed);
        clearCredentials(credentials);
        if (result == ALLNEWMTS_REST_AUTH_OK) credentials = renewed;
        clearCredentials(renewed);
        if (result != ALLNEWMTS_REST_AUTH_OK) return finish(result);
        if (!schema->read_only)
          return finish(ALLNEWMTS_REST_AUTH_HTTP_ERROR);
        wipe(response.data(), response.size());
        continue;
      }
      if (parsed == TransactionParse::Accepted)
        return finish(ALLNEWMTS_REST_AUTH_OK);
      return finish(parsed == TransactionParse::Rejected
                        ? ALLNEWMTS_REST_AUTH_REJECTED
                        : ALLNEWMTS_REST_AUTH_RESPONSE_INVALID);
    }
  } catch (const std::bad_alloc &) {
    return finish(ALLNEWMTS_REST_AUTH_RESOURCE_LIMIT);
  }
  return finish(ALLNEWMTS_REST_AUTH_HTTP_ERROR);
}

extern "C" void allnewmts_rest_auth_destroy(AllNewMTSRestAuth *manager) {
  if (!manager) return;
  {
    std::unique_lock<std::mutex> lock(manager->mutex);
    manager->closing = true;
    manager->condition.wait(lock, [manager] {
      return !manager->issuing && manager->active_transactions == 0;
    });
    clearCredentials(manager->credentials);
    if (!manager->auth_key.empty())
      wipe(manager->auth_key.data(), manager->auth_key.size());
  }
  delete manager;
}

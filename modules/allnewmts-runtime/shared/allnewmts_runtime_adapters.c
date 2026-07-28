#include "allnewmts_runtime_adapters.h"

uint32_t allnewmts_runtime_adapter_parse_id(const uint8_t *bytes, size_t size,
                                             uint64_t *output) {
  uint64_t value = 0;
  size_t index;
  if (!bytes || !output || !size || (size > 1 && bytes[0] == '0'))
    return ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;
  for (index = 0; index < size; ++index) {
    uint64_t digit;
    if (bytes[index] < '0' || bytes[index] > '9')
      return ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;
    digit = (uint64_t)(bytes[index] - '0');
    if (value > (UINT64_MAX - digit) / 10)
      return ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;
    value = value * 10 + digit;
  }
  if (!value) return ALLNEWMTS_RUNTIME_INVALID_ARGUMENT;
  *output = value;
  return ALLNEWMTS_RUNTIME_OK;
}

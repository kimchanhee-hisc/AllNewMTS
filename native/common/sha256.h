#ifndef ALLNEWMTS_SHA256_H
#define ALLNEWMTS_SHA256_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifndef ALLNEWMTS_SHA256_NAME
#define ALLNEWMTS_SHA256_NAME allnewmts_sha256
#endif

void ALLNEWMTS_SHA256_NAME(const unsigned char *data, size_t size, unsigned char out[32]);
#define allnewmts_sha256 ALLNEWMTS_SHA256_NAME

#ifdef __cplusplus
}
#endif

#endif

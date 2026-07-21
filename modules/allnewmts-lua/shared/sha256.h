#ifndef ALLNEWMTS_SHA256_H
#define ALLNEWMTS_SHA256_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void allnewmts_sha256(const unsigned char *data, size_t size, unsigned char out[32]);

#ifdef __cplusplus
}
#endif

#endif

#ifndef ALLNEWMTS_RESOURCE_BUNDLE_H
#define ALLNEWMTS_RESOURCE_BUNDLE_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  const char *path;
  const unsigned char *bytes;
  size_t size;
  const unsigned char sha256[32];
} AllNewMTSResource;

const AllNewMTSResource *allnewmts_resource(const char *path, size_t size);

#ifdef __cplusplus
}
#endif

#endif

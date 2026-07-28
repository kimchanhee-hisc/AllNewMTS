#ifndef ALLNEWMTS_PRODUCT_MCI_H
#define ALLNEWMTS_PRODUCT_MCI_H

#include "allnewmts_mci.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef void *AllNewMTSProductMciHandle;

uint32_t allnewmts_product_mci_create(AllNewMTSProductMciHandle *handle);

uint32_t allnewmts_product_mci_connect_beta(
    AllNewMTSProductMciHandle handle, const uint8_t *source,
    size_t source_size);

uint32_t allnewmts_product_mci_fetch_samsung_electronics(
    AllNewMTSProductMciHandle handle, AllNewMTSMciGd1000q1Quote *quote);

void allnewmts_product_mci_destroy(AllNewMTSProductMciHandle handle);

#ifdef __cplusplus
}
#endif

#endif

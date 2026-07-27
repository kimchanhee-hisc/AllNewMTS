#ifndef ALLNEWMTS_MCI_SOCKET_H
#define ALLNEWMTS_MCI_SOCKET_H

#include "allnewmts_mci.h"

#ifdef __cplusplus
extern "C" {
#endif

uint32_t allnewmts_mci_socket_create(
    int (*authenticate)(void *context, const AllNewMTSMciSession *session,
                        uint64_t generation),
    void *authentication_context, AllNewMTSMciTransport *transport,
    void **transport_context);

void allnewmts_mci_socket_destroy(void *transport_context);

#ifdef __cplusplus
}
#endif

#endif

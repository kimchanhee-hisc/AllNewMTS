#include "allnewmts_product_mci.h"

#include "allnewmts_mci_socket.h"
#include "allnewmts_product_config.h"

#include <mutex>
#include <new>

namespace {

int acceptPublicSession(void *, const AllNewMTSMciSession *, uint64_t) {
  return 1;
}

struct ProductMci {
  std::mutex mutex;
  AllNewMTSMciTransport transport{};
  void *transport_context = nullptr;
  AllNewMTSMciClient *client = nullptr;
};

}  // namespace

extern "C" uint32_t allnewmts_product_mci_create(
    AllNewMTSProductMciHandle *handle) {
  if (!handle) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  auto *created = new (std::nothrow) ProductMci();
  if (!created) return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  uint32_t code = allnewmts_mci_socket_create(
      acceptPublicSession, nullptr, &created->transport,
      &created->transport_context);
  if (code == ALLNEWMTS_MCI_OK)
    code = allnewmts_mci_create(allnewmts_product_mci_channel_detail(),
                                &created->transport,
                                created->transport_context, &created->client);
  if (code != ALLNEWMTS_MCI_OK) {
    allnewmts_mci_socket_destroy(created->transport_context);
    delete created;
    return code;
  }
  *handle = created;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_product_mci_connect_beta(
    AllNewMTSProductMciHandle handle, const uint8_t *source,
    size_t source_size) {
  if (!handle) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  auto *product = static_cast<ProductMci *>(handle);
  std::lock_guard<std::mutex> lock(product->mutex);
  return allnewmts_mci_connect_beta(product->client, source, source_size);
}

extern "C" uint32_t allnewmts_product_mci_fetch_samsung_electronics(
    AllNewMTSProductMciHandle handle, AllNewMTSMciGd1000q1Quote *quote) {
  if (!handle || !quote) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  auto *product = static_cast<ProductMci *>(handle);
  std::lock_guard<std::mutex> lock(product->mutex);
  return allnewmts_mci_request_gd1000q1(product->client, "J", "005930", "K",
                                        "", quote);
}

extern "C" void allnewmts_product_mci_destroy(
    AllNewMTSProductMciHandle handle) {
  auto *product = static_cast<ProductMci *>(handle);
  if (!product) return;
  allnewmts_mci_destroy(product->client);
  allnewmts_mci_socket_destroy(product->transport_context);
  delete product;
}

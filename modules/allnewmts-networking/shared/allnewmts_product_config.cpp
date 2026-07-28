#include "allnewmts_product_config.h"

#ifndef ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL
#error "ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL is required"
#endif

namespace {

constexpr char kMciChannelDetail[] = ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL;
static_assert(sizeof(kMciChannelDetail) == 6,
              "MCI channel detail must be five bytes");

}  // namespace

extern "C" const char *allnewmts_product_mci_channel_detail(void) {
  return kMciChannelDetail;
}

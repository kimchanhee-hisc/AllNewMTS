#include "allnewmts_mci.h"
#include "allnewmts_mci_socket.h"
#include "allnewmts_product_config.h"

#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <vector>

namespace {

int rejectAuthentication(void *, const AllNewMTSMciSession *, uint64_t) {
  return 0;
}

}  // namespace

int main(int argc, char **argv) {
  const char *live = std::getenv("ALLNEWMTS_MCI_LIVE_BETA_REAL");
  if (argc != 2 || !live || std::strcmp(live, "S00:005930") != 0) {
    std::cerr << "FAIL MCI BETA S00 probe configuration\n";
    return 64;
  }

  std::ifstream source(argv[1], std::ios::binary | std::ios::ate);
  std::streamoff size = -1;
  if (source) size = source.tellg();
  if (size <= 0 || size > 64 * 1024) {
    std::cerr << "FAIL MCI BETA S00 probe source\n";
    return 65;
  }
  source.seekg(0);
  std::vector<uint8_t> bytes(static_cast<size_t>(size));
  if (!source.read(reinterpret_cast<char *>(bytes.data()), size)) {
    std::cerr << "FAIL MCI BETA S00 probe source\n";
    return 65;
  }

  AllNewMTSMciTransport transport{};
  void *transport_context = nullptr;
  uint32_t code = allnewmts_mci_socket_create(
      rejectAuthentication, nullptr, &transport, &transport_context);
  AllNewMTSMciClient *client = nullptr;
  if (code == ALLNEWMTS_MCI_OK)
    code = allnewmts_mci_create(allnewmts_product_mci_channel_detail(),
                                &transport, transport_context, &client);
  AllNewMTSMciRealtimeQuote quote{};
  if (code == ALLNEWMTS_MCI_OK)
    code = allnewmts_mci_probe_beta_s00_005930(
        client, bytes.data(), bytes.size(), &quote);
  allnewmts_mci_destroy(client);
  allnewmts_mci_socket_destroy(transport_context);

  if (code != ALLNEWMTS_MCI_OK) {
    std::cerr << "FAIL MCI BETA S00 probe code=" << code << '\n';
    return 1;
  }
  std::cout << "PASS MCI BETA S00/005930 currentPrice="
            << quote.current_price << " tradeTime=" << quote.trade_time
            << "; unsubscribed; socket closed\n";
}

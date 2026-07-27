#include "allnewmts_product_config.h"

#include <cassert>
#include <cstring>

int main(int argc, char **argv) {
  assert(argc == 2);
  assert(std::strcmp(allnewmts_product_mci_channel_detail(), argv[1]) == 0);
}

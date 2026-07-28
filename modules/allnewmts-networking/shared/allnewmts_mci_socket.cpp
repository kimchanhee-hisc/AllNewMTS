#include "allnewmts_mci_socket.h"

#include <arpa/inet.h>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <netdb.h>
#include <new>
#include <poll.h>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

namespace {

using Clock = std::chrono::steady_clock;

struct SocketTransport {
  int descriptor = -1;
  int (*authenticate)(void *, const AllNewMTSMciSession *, uint64_t) = nullptr;
  void *authentication_context = nullptr;
};

void closeDescriptor(SocketTransport *socket) {
  if (socket->descriptor < 0) return;
  shutdown(socket->descriptor, SHUT_RDWR);
  close(socket->descriptor);
  socket->descriptor = -1;
}

int remainingMilliseconds(Clock::time_point deadline) {
  auto remaining =
      std::chrono::duration_cast<std::chrono::milliseconds>(deadline -
                                                            Clock::now())
          .count();
  if (remaining <= 0) return 0;
  return remaining > INT32_MAX ? INT32_MAX : static_cast<int>(remaining);
}

bool waitFor(int descriptor, short events, Clock::time_point deadline) {
  for (;;) {
    int timeout = remainingMilliseconds(deadline);
    if (!timeout) return false;
    pollfd item{descriptor, events, 0};
    int result = poll(&item, 1, timeout);
    if (result > 0)
      return (item.revents & events) != 0 &&
             (item.revents & (POLLERR | POLLNVAL)) == 0;
    if (result == 0) return false;
    if (errno != EINTR) return false;
  }
}

int socketOpen(void *opaque, const char *host, uint16_t port,
               uint32_t timeout_ms, uint64_t) {
  auto *socket = static_cast<SocketTransport *>(opaque);
  if (!socket || !host || !*host || !port || !timeout_ms) return 0;
  closeDescriptor(socket);

  char service[6];
  std::snprintf(service, sizeof(service), "%u", port);
  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  in_addr ipv4{};
  in6_addr ipv6{};
  if (inet_pton(AF_INET, host, &ipv4) == 1 ||
      inet_pton(AF_INET6, host, &ipv6) == 1)
    hints.ai_flags = AI_NUMERICHOST;

  addrinfo *addresses = nullptr;
  if (getaddrinfo(host, service, &hints, &addresses) != 0) return 0;
  const auto deadline = Clock::now() + std::chrono::milliseconds(timeout_ms);
  for (addrinfo *address = addresses; address; address = address->ai_next) {
    int descriptor =
        ::socket(address->ai_family, address->ai_socktype, address->ai_protocol);
    if (descriptor < 0) continue;
    int flags = fcntl(descriptor, F_GETFL, 0);
    if (flags < 0 || fcntl(descriptor, F_SETFL, flags | O_NONBLOCK) < 0) {
      close(descriptor);
      continue;
    }
#ifdef SO_NOSIGPIPE
    int enabled = 1;
    setsockopt(descriptor, SOL_SOCKET, SO_NOSIGPIPE, &enabled,
               sizeof(enabled));
#endif
    int result = connect(descriptor, address->ai_addr, address->ai_addrlen);
    if (result < 0 && errno == EINPROGRESS &&
        waitFor(descriptor, POLLOUT, deadline)) {
      int error = 0;
      socklen_t length = sizeof(error);
      result = getsockopt(descriptor, SOL_SOCKET, SO_ERROR, &error, &length);
      if (result == 0 && error == 0) result = 0;
      else result = -1;
    }
    if (result == 0) {
      socket->descriptor = descriptor;
      freeaddrinfo(addresses);
      return 1;
    }
    close(descriptor);
    if (!remainingMilliseconds(deadline)) break;
  }
  freeaddrinfo(addresses);
  return 0;
}

int socketWrite(void *opaque, const uint8_t *bytes, size_t size,
                uint32_t timeout_ms, uint64_t) {
  auto *socket = static_cast<SocketTransport *>(opaque);
  if (!socket || socket->descriptor < 0 || (!bytes && size) || !timeout_ms)
    return 0;
  const auto deadline = Clock::now() + std::chrono::milliseconds(timeout_ms);
  size_t written = 0;
  while (written < size) {
    if (!waitFor(socket->descriptor, POLLOUT, deadline)) return 0;
#ifdef MSG_NOSIGNAL
    constexpr int flags = MSG_NOSIGNAL;
#else
    constexpr int flags = 0;
#endif
    ssize_t amount =
        send(socket->descriptor, bytes + written, size - written, flags);
    if (amount > 0) {
      written += static_cast<size_t>(amount);
      continue;
    }
    if (amount < 0 && (errno == EINTR || errno == EAGAIN ||
                       errno == EWOULDBLOCK))
      continue;
    return 0;
  }
  return 1;
}

int socketRead(void *opaque, uint8_t *bytes, size_t capacity, size_t *size,
               uint32_t timeout_ms, uint64_t) {
  auto *socket = static_cast<SocketTransport *>(opaque);
  if (!socket || socket->descriptor < 0 || !bytes || !capacity || !size ||
      !timeout_ms)
    return 0;
  const auto deadline = Clock::now() + std::chrono::milliseconds(timeout_ms);
  for (;;) {
    if (!waitFor(socket->descriptor, POLLIN, deadline)) return 0;
    ssize_t amount = recv(socket->descriptor, bytes, capacity, 0);
    if (amount > 0) {
      *size = static_cast<size_t>(amount);
      return 1;
    }
    if (amount < 0 &&
        (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK))
      continue;
    return 0;
  }
}

int socketAuthenticate(void *opaque, const AllNewMTSMciSession *session,
                       uint64_t generation) {
  auto *socket = static_cast<SocketTransport *>(opaque);
  return socket && socket->authenticate
             ? socket->authenticate(socket->authentication_context, session,
                                    generation)
             : 0;
}

void socketClose(void *opaque, uint64_t) {
  auto *socket = static_cast<SocketTransport *>(opaque);
  if (socket) closeDescriptor(socket);
}

void socketWait(void *, uint32_t delay_ms) {
  std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
}

uint64_t socketNow(void *) {
  return static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
          Clock::now().time_since_epoch())
          .count());
}

}  // namespace

extern "C" uint32_t allnewmts_mci_socket_create(
    int (*authenticate)(void *, const AllNewMTSMciSession *, uint64_t),
    void *authentication_context, AllNewMTSMciTransport *transport,
    void **transport_context) {
  if (!authenticate || !transport || !transport_context)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  auto *socket = new (std::nothrow) SocketTransport();
  if (!socket) return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  socket->authenticate = authenticate;
  socket->authentication_context = authentication_context;
  *transport = {socketOpen,  socketWrite, socketRead, socketAuthenticate,
                socketClose, socketWait,  socketNow};
  *transport_context = socket;
  return ALLNEWMTS_MCI_OK;
}

extern "C" void allnewmts_mci_socket_destroy(void *transport_context) {
  auto *socket = static_cast<SocketTransport *>(transport_context);
  if (!socket) return;
  closeDescriptor(socket);
  delete socket;
}

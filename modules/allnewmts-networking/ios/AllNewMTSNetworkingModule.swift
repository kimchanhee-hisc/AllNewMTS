import ExpoModulesCore
import Foundation

private let responseLimit = 4_096

private final class LoopbackProbe: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
  private let promise: Promise
  private var data = Data()
  private var response: HTTPURLResponse?
  private var session: URLSession?
  private var settled = false

  init(port: Int, promise: Promise) {
    self.promise = promise
    super.init()

    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 5
    configuration.timeoutIntervalForResource = 5
    configuration.urlCache = nil

    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 1
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
    self.session = session
    session.dataTask(with: URL(string: "http://127.0.0.1:\(port)/")!).resume()
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let response = response as? HTTPURLResponse else {
      completionHandler(.cancel)
      finish(code: "TRANSPORT_ERROR")
      return
    }
    self.response = response
    if response.expectedContentLength > responseLimit {
      completionHandler(.cancel)
      finish(code: "RESPONSE_LIMIT")
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard self.data.count + data.count <= responseLimit else {
      dataTask.cancel()
      finish(code: "RESPONSE_LIMIT")
      return
    }
    self.data.append(data)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard !settled else { return }
    guard error == nil, let response else {
      finish(code: "TRANSPORT_ERROR")
      return
    }
    guard let body = String(data: data, encoding: .utf8) else {
      finish(code: "RESPONSE_INVALID", status: response.statusCode)
      return
    }
    finish(
      code: (200..<300).contains(response.statusCode) ? "OK" : "HTTP_STATUS",
      status: response.statusCode,
      body: body
    )
  }

  private func finish(code: String, status: Int = 0, body: String = "") {
    guard !settled else { return }
    settled = true
    promise.resolve(["code": code, "httpStatus": status, "body": body])
    session?.invalidateAndCancel()
    session = nil
  }
}

public final class AllNewMTSNetworkingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AllNewMTSNetworking")

    AsyncFunction("probeLoopback") { (port: Int, promise: Promise) in
      guard (1...65_535).contains(port) else {
        promise.resolve(["code": "INVALID_ARGUMENT", "httpStatus": 0, "body": ""])
        return
      }
      _ = LoopbackProbe(port: port, promise: promise)
    }
  }
}

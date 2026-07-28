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
  private var mci: UnsafeMutableRawPointer?

  public func definition() -> ModuleDefinition {
    Name("AllNewMTSNetworking")

    AsyncFunction("probeLoopback") { (port: Int, promise: Promise) in
      guard (1...65_535).contains(port) else {
        promise.resolve(["code": "INVALID_ARGUMENT", "httpStatus": 0, "body": ""])
        return
      }
      _ = LoopbackProbe(port: port, promise: promise)
    }

    AsyncFunction("connectMciBeta") { (sourceBase64: String) -> [String: Any] in
      guard sourceBase64.utf8.count <= 87_384,
            let source = Data(base64Encoded: sourceBase64),
            !source.isEmpty,
            source.count <= 65_536 else {
        return ["code": "INVALID_ARGUMENT"]
      }
      if self.mci == nil {
        var handle: UnsafeMutableRawPointer?
        let code = allnewmts_product_mci_create(&handle)
        guard code == 0, let handle else {
          return ["code": mciCode(code)]
        }
        self.mci = handle
      }
      let code = source.withUnsafeBytes { bytes in
        allnewmts_product_mci_connect_beta(
          self.mci,
          bytes.bindMemory(to: UInt8.self).baseAddress,
          source.count
        )
      }
      return ["code": mciCode(code)]
    }

    AsyncFunction("fetchSamsungElectronicsQuote") { () -> [String: Any] in
      guard let mci = self.mci else {
        return ["code": "NOT_READY"]
      }
      var quote = AllNewMTSMciGd1000q1Quote()
      let code = allnewmts_product_mci_fetch_samsung_electronics(mci, &quote)
      guard code == 0 else {
        return ["code": mciCode(code)]
      }
      let instrument = withUnsafePointer(to: &quote.instrument) {
        $0.withMemoryRebound(to: CChar.self, capacity: 7) {
          String(cString: $0)
        }
      }
      return [
        "code": "OK",
        "instrument": instrument,
        "currentPrice": String(quote.current_price),
      ]
    }

    AsyncFunction("disconnectMci") {
      self.destroyMci()
    }

    OnDestroy {
      self.destroyMci()
    }
  }

  private func destroyMci() {
    allnewmts_product_mci_destroy(mci)
    mci = nil
  }
}

private func mciCode(_ code: UInt32) -> String {
  switch code {
  case 0: return "OK"
  case 1: return "INVALID_ARGUMENT"
  case 2: return "BETA_SOURCE_MISMATCH"
  case 3: return "BETA_ENDPOINT_INVALID"
  case 4: return "TRANSPORT_ERROR"
  case 5: return "FRAME_INVALID"
  case 6: return "INIT_INVALID"
  case 7: return "AUTH_FAILED"
  case 8: return "NOT_READY"
  case 9: return "RESOURCE_LIMIT"
  case 10: return "TRANSACTION_REJECTED"
  case 11: return "TRANSACTION_INVALID"
  case 12: return "TRANSACTION_BODY_INVALID"
  default: return "TRANSPORT_ERROR"
  }
}

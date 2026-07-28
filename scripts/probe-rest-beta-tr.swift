import Foundation

private enum ProbeFailure: Error {
    case configuration(String)
    case remote(String)
}

private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

private struct Probe {
    let baseURL: URL
    let apiPath: String
    let channelDetail: String
    let clientID: String
    let htsID: String
    let authKey: String
    let market: String
    let session: URLSession

    func post(
        path: String,
        body: [String: String],
        extraHeaders: [String: String] = [:],
        timeout: TimeInterval
    ) async throws -> (Int, [String: Any]) {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false),
              components.scheme == "https",
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil else {
            throw ProbeFailure.configuration("invalid REST BETA base URL")
        }
        components.path = path
        guard let url = components.url else {
            throw ProbeFailure.configuration("invalid REST BETA request URL")
        }

        var request = URLRequest(
            url: url,
            cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
            timeoutInterval: timeout
        )
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(channelDetail, forHTTPHeaderField: "H_CHNL_DETL_SCD")
        request.setValue(authKey, forHTTPHeaderField: "auth_key")
        request.setValue("keep-alive", forHTTPHeaderField: "connection")
        request.setValue("ko-KR", forHTTPHeaderField: "content-language")
        request.setValue(htsID, forHTTPHeaderField: "h_hts_id")
        for (name, value) in extraHeaders {
            request.setValue(value, forHTTPHeaderField: name)
        }

        let bytes: URLSession.AsyncBytes
        let response: URLResponse
        do {
            (bytes, response) = try await session.bytes(for: request)
        } catch {
            throw ProbeFailure.remote("transport failed")
        }
        guard let http = response as? HTTPURLResponse else {
            throw ProbeFailure.remote("non-HTTP response")
        }
        var data = Data()
        do {
            for try await byte in bytes {
                guard data.count < 262_144 else {
                    throw ProbeFailure.remote("response exceeded 262144 bytes")
                }
                data.append(byte)
            }
        } catch let failure as ProbeFailure {
            throw failure
        } catch {
            throw ProbeFailure.remote("response read failed")
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            return (http.statusCode, [:])
        }
        guard let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any] else {
            throw ProbeFailure.remote("invalid JSON response")
        }
        return (http.statusCode, json)
    }

    func issueAccessToken() async throws -> String {
        let body = ["client_id": clientID]
        let (keyHTTP, keyJSON) =
            try await post(path: "/clientAuth", body: body, timeout: 15)
        guard (200...299).contains(keyHTTP),
              (keyJSON["status"] as? Int ?? 0) == 0,
              let accessKey = keyJSON["access_key"] as? String,
              !accessKey.isEmpty else {
            throw ProbeFailure.remote("AccessKey issuance rejected (HTTP \(keyHTTP))")
        }
        let (tokenHTTP, tokenJSON) = try await post(
            path: "/clientAccessToken",
            body: body,
            extraHeaders: ["access_key": accessKey],
            timeout: 15
        )
        guard (200...299).contains(tokenHTTP),
              (tokenJSON["status"] as? Int ?? 0) == 0,
              let accessToken = tokenJSON["access_token"] as? String,
              !accessToken.isEmpty else {
            throw ProbeFailure.remote("AccessToken issuance rejected (HTTP \(tokenHTTP))")
        }
        return accessToken
    }

    func transaction(accessToken: String) async throws -> (Int, [String: Any]) {
        try await post(
            path: apiPath + "/tr/TR3200Q1",
            body: ["OVRS_MKT_COD": market],
            extraHeaders: [
                "authorization": accessToken,
                "H_SCREEN_FILENAME": "HS7001S03",
            ],
            timeout: 30
        )
    }

    func run() async throws -> [String: String] {
        var accessToken = try await issueAccessToken()
        var (http, json) = try await transaction(accessToken: accessToken)
        let unauthorized = http == 401 || http == 403 ||
            (json["status"] as? Int).map { $0 == 401 || $0 == 403 } == true
        if unauthorized {
            accessToken = try await issueAccessToken()
            (http, json) = try await transaction(accessToken: accessToken)
        }
        guard (200...299).contains(http) else {
            throw ProbeFailure.remote("TR3200Q1 rejected (HTTP \(http))")
        }
        guard (json["status"] as? Int ?? 0) == 0,
              json["resultCode"] as? String == "00000000",
              let outputData = json["outputData"] as? [String: Any],
              let record = outputData["outRec1"] as? [String: Any] else {
            throw ProbeFailure.remote("TR3200Q1 response envelope rejected")
        }
        var output: [String: String] = [:]
        for (name, value) in record {
            guard let string = value as? String else {
                throw ProbeFailure.remote("TR3200Q1 returned a non-string field")
            }
            output[name] = string
        }
        guard output.count == 62,
              output["OVRS_MKT_COD"].map({ $0 == market }) ?? true else {
            throw ProbeFailure.remote("TR3200Q1 output schema did not match")
        }
        return output
    }
}

private enum Main {
    static func run() async {
        do {
            let environment = ProcessInfo.processInfo.environment
            let arguments = Array(CommandLine.arguments.dropFirst())
            guard environment["ALLNEWMTS_REST_LIVE_BETA_TR"] == "TR3200Q1",
                  arguments.count == 4,
                  arguments[0] == "--platform",
                  ["ios", "android"].contains(arguments[1]),
                  arguments[2] == "--market",
                  ["01", "02", "03"].contains(arguments[3]) else {
                throw ProbeFailure.configuration(
                    "set ALLNEWMTS_REST_LIVE_BETA_TR=TR3200Q1 and use "
                        + "--platform ios|android --market 01|02|03"
                )
            }

            let root = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
            let configData =
                try Data(contentsOf: root.appendingPathComponent("config/product-config.json"))
            guard let config =
                    try JSONSerialization.jsonObject(with: configData) as? [String: Any],
                  config["environment"] as? String == "beta",
                  let rest = config["restApi"] as? [String: Any],
                  let base = rest["baseUrl"] as? String,
                  base == "https://plus-cmn-beta.hanwhawm.com:1443",
                  let baseURL = URL(string: base),
                  let apiPath = rest["apiPath"] as? String,
                  apiPath == "/mts/os/1",
                  let clientID = rest["clientId"] as? String,
                  let htsID = rest["htsId"] as? String,
                  let platforms = config["platforms"] as? [String: Any],
                  let platform = platforms[arguments[1]] as? [String: Any],
                  let channel = platform["mciChannelDetail"] as? String,
                  let secretStore = config["secretStore"] as? [String: Any],
                  let localPath = secretStore["localPath"] as? String,
                  let fileVariable =
                    secretStore["easFileEnvironmentVariable"] as? String else {
                throw ProbeFailure.configuration("invalid product config")
            }

            let selectedSecretPath =
                environment[fileVariable].flatMap { $0.isEmpty ? nil : $0 } ?? localPath
            let secretURL = selectedSecretPath.hasPrefix("/")
                ? URL(fileURLWithPath: selectedSecretPath)
                : root.appendingPathComponent(selectedSecretPath)
            let attributes =
                try FileManager.default.attributesOfItem(atPath: secretURL.path)
            guard let byteCount = attributes[.size] as? NSNumber,
                  byteCount.intValue <= 8_192 else {
                throw ProbeFailure.configuration("secret file is missing or too large")
            }
            let secretData = try Data(contentsOf: secretURL)
            guard let secrets =
                    try JSONSerialization.jsonObject(with: secretData) as? [String: Any],
                  secrets["$schema"] as? String == "./product-secrets.schema.json",
                  secrets["schemaVersion"] as? Int == 1,
                  let authKey = secrets["restApiAuthKey"] as? String,
                  !authKey.isEmpty else {
                throw ProbeFailure.configuration("invalid secret file")
            }

            let configuration = URLSessionConfiguration.ephemeral
            configuration.urlCache = nil
            configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            configuration.httpShouldSetCookies = false
            configuration.waitsForConnectivity = false
            let session = URLSession(
                configuration: configuration,
                delegate: NoRedirect(),
                delegateQueue: nil
            )
            defer { session.invalidateAndCancel() }
            let output = try await Probe(
                baseURL: baseURL,
                apiPath: apiPath,
                channelDetail: channel,
                clientID: clientID,
                htsID: htsID,
                authKey: authKey,
                market: arguments[3],
                session: session
            ).run()
            let report: [String: Any] = [
                "transactionId": "TR3200Q1",
                "market": arguments[3],
                "fieldCount": output.count,
                "outRec1": output,
            ]
            let encoded = try JSONSerialization.data(
                withJSONObject: report,
                options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            )
            FileHandle.standardOutput.write(encoded)
            FileHandle.standardOutput.write(Data([0x0A]))
            Foundation.exit(0)
        } catch ProbeFailure.configuration(let message) {
            FileHandle.standardError.write(
                Data("FAIL REST BETA probe configuration: \(message)\n".utf8)
            )
            Foundation.exit(64)
        } catch ProbeFailure.remote(let message) {
            FileHandle.standardError.write(
                Data("FAIL REST BETA TR3200Q1 probe: \(message)\n".utf8)
            )
            Foundation.exit(1)
        } catch {
            FileHandle.standardError.write(Data("FAIL REST BETA probe\n".utf8))
            Foundation.exit(1)
        }
    }
}

Task {
    await Main.run()
}
dispatchMain()

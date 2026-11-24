// macOS 自带 WebKit 隔离验证：不依赖 Safari 远程自动化，不使用用户浏览器存储。
import Cocoa
import WebKit
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
class Probe: NSObject, WKScriptMessageHandler {
    var view: WKWebView!
    var window: NSWindow!
    var failed = false
    let output = CommandLine.arguments[3]
    func run() throws {
        try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "qa")
        let script = try String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8)
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 1000), configuration: config)
        window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "架构图 WebKit 隔离回归"
        window.contentView = view
        window.orderFront(nil)
        let url = URL(string: CommandLine.arguments[1])!
        if url.isFileURL { view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) }
        else { view.load(URLRequest(url: url)) }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "log" { print(body); return }
        if type == "done" || type == "error" {
            failed = failed || type == "error"
            print("\(failed ? "FAIL" : "PASS") WebKit \(body["message"] ?? "")")
            exit(failed ? 1 : 0)
        }
        guard type == "snapshot", let label = body["label"] as? String, let samples = body["samples"] as? [[String: Any]] else { return }
        view.takeSnapshot(with: nil) { image, error in
            var issues: [String] = []
            if let image = image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff) {
                if let png = bitmap.representation(using: .png, properties: [:]) {
                    try? png.write(to: URL(fileURLWithPath: self.output + "/" + label + ".png"))
                }
                let scale = Double(bitmap.pixelsWide) / self.view.bounds.width
                for sample in samples {
                    let x = sample["x"] as! Double, y = sample["y"] as! Double
                    let w = sample["w"] as! Double, h = sample["h"] as! Double
                    var ink = 0
                    for py in max(0, Int(y * scale))..<min(bitmap.pixelsHigh, Int((y + h) * scale)) {
                        for px in max(0, Int(x * scale))..<min(bitmap.pixelsWide, Int((x + w) * scale)) {
                            if let color = bitmap.colorAt(x: px, y: py)?.usingColorSpace(.deviceRGB),
                               max(color.redComponent, color.greenComponent, color.blueComponent) < 0.55 { ink += 1 }
                        }
                    }
                    if ink < 4 { issues.append("\(sample["id"] ?? "") 名称区域未绘出文字") }
                }
            } else { issues.append("无法生成 WebKit 绘制截图：\(String(describing: error))") }
            self.failed = self.failed || !issues.isEmpty
            print("\(issues.isEmpty ? "PASS" : "FAIL") \(label) 实际绘制 \(samples.count) 张组织卡 \(issues.joined(separator: "; "))")
            Task { @MainActor in
                do { _ = try await self.view.callAsyncJavaScript("window.__qaResolve(issues);", arguments: ["issues": issues], in: message.frameInfo, contentWorld: .page) }
                catch { self.failed = true; print("FAIL \(error)"); exit(1) }
            }
        }
    }
}
let probe = Probe()
do { try probe.run() } catch { print("FAIL \(error)"); exit(1) }
DispatchQueue.main.asyncAfter(deadline: .now() + 45) {
 probe.view.takeSnapshot(with:nil) { image, error in
 if let tiff=image?.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) { try? png.write(to:URL(fileURLWithPath:probe.output+"/timeout.png")) }
 print("FAIL WebKit 测试超时");exit(1)
 }
}
app.run()
exit(probe.failed ? 1 : 0)

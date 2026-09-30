// Local Apple Vision OCR. Output is an inspection cache, not a public transcript.
import Foundation
import Vision
import ImageIO

struct Box: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}
struct Entry: Codable { let path: String; let boxes: [Box] }
let input = CommandLine.arguments[1]
let paths = try String(contentsOfFile: input, encoding: .utf8).split(separator: "\n").map(String.init)
var entries: [Entry] = []
for path in paths {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path))
    try handler.perform([request])
    let boxes = (request.results ?? []).compactMap { result -> Box? in
        guard let candidate = result.topCandidates(1).first else { return nil }
        let b = result.boundingBox
        return Box(text: candidate.string, confidence: candidate.confidence,
                   x: b.origin.x, y: 1-b.origin.y-b.height, width: b.width, height: b.height)
    }
    entries.append(Entry(path: path, boxes: boxes))
}
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
FileHandle.standardOutput.write(try encoder.encode(entries))

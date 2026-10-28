import Foundation
import Vision
import AppKit

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
guard let image = NSImage(contentsOfFile: path),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let cg = bitmap.cgImage else {
    fputs("could not load image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US", "ar-SA"]
request.minimumTextHeight = 0

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("vision failed: \(error)\n", stderr)
    exit(2)
}

let observations = request.results ?? []
let sorted = observations.sorted { $0.boundingBox.midY > $1.boundingBox.midY }

struct Row {
    var midY: CGFloat
    var height: CGFloat
    var items: [VNRecognizedTextObservation]
}

var rows: [Row] = []
for observation in sorted {
    let height = max(observation.boundingBox.height, 0.01)
    if let index = rows.indices.last,
       abs(rows[index].midY - observation.boundingBox.midY) <= max(0.008, rows[index].height * 0.55) {
        rows[index].items.append(observation)
    } else {
        rows.append(Row(midY: observation.boundingBox.midY, height: height, items: [observation]))
    }
}

var scores: [Float] = []
for row in rows {
    let ordered = row.items.sorted { $0.boundingBox.minX < $1.boundingBox.minX }
    var parts: [String] = []
    for observation in ordered {
        guard let candidate = observation.topCandidates(1).first else { continue }
        scores.append(candidate.confidence)
        parts.append(candidate.string)
    }
    if !parts.isEmpty {
        print(parts.joined(separator: " "))
    }
}

let average = scores.isEmpty ? 0 : scores.reduce(0, +) / Float(scores.count)
fputs(String(format: "confidence=%.4f\n", average), stderr)

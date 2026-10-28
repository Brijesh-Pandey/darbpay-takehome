# ADR 0009: Apple Vision for the live extractor

- Status: accepted
- Date: 27 Oct 2026
- Deciders: project owner

## Context

ADR 0002 deferred a live extractor until after the review page. That page is in the repository, and the owner asked for real OCR. A hosted vision API needs an account and a secret. `npm test` must keep passing with no key and no network. The sample webhooks still post synthetic text, so the mock has to remain the default.

## Decision

`EXTRACTOR=tesseract` selects `TesseractExtractor`. An unset value, or `mock`, selects `MockExtractor`. The flag name stayed, so a running server did not need a new variable. The photo engine did not.

JPEG, PNG, WEBP, and BMP are read by Apple's Vision framework, in English and Arabic, on macOS. The stored bytes are unchanged. A photo whose paper is a small part of the frame is cropped, then enlarged. Words on the same row are joined. If the full page has no payable amount, or the VAT number is short of 15 digits, the reader makes a closer pass over horizontal bands and keeps the amount line and the completed VAT number from that pass. The average word confidence is stored as `extractionConfidence`. Reads are queued. A line that is only VAT, tax, a subtotal, change, or tender is not the payable amount. A VAT-able line is used only when no stronger amount is present. A faint decimal printed as a space (`800 00`) is read as `800.00`.

Tesseract.js, including the Arabic model, was tried on the same station photos. It did not return the VAT number, the invoice number, or, on the ADNOC slip, the total.

A PDF is not rendered. `unpdf` reads the embedded text. That path stores confidence 0.59, which is under the 0.60 auto-match gate, because a text layer is not an OCR score. A PDF with almost no text is `UNREADABLE`, and the document becomes `FAILED`.

`parseReceiptText` turns the words into the same Zod object the mock returns. Amounts use that currency's minor-unit exponent. The parser does not call the network. The first photo compiles a small Swift reader into the OS temp directory. Tests pass a stub reader and do not compile it.

## Alternatives

| Option | Why it was not chosen |
| --- | --- |
| Cloudflare Workers AI, or another hosted vision API | Needs a token. The suite could not run it, and no account was created for this change. |
| Make Vision the default | The sample files are synthetic text declared as JPEG or PDF. Vision would fail them. |
| Keep Tesseract for photos | English and Arabic Tesseract did not read the VAT number, invoice number, or ADNOC total on the station photos. |
| Rasterize a scanned PDF | Needs a native canvas. A photo of the page is the path that already works. |
| Store a high confidence for PDF text | Would auto-match a document the engine did not score. |

## Consequences

A real photo can be read on this machine without an account. The fixture pipeline is unchanged.

Photos need macOS. `swiftc` compiles the reader on the first photo. A Linux host, including a typical container, cannot run that reader, and the photo becomes `UNREADABLE`. PDF text extraction does not need macOS. Currency conversion is `lib/money` and does not use the host. A scanned PDF is refused. HMAC is still absent, so this extractor should not be exposed on the public internet.

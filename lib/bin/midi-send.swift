// midi-send — CoreMIDI virtual-source sender for the Logic control plane.
//
// Opens a virtual CoreMIDI source named "Logic Agent" and emits raw MIDI
// bytes given as hex pairs on argv. Logic Pro consumes Mackie Control +
// MMC on a virtual port natively (no per-parameter learn), so this is the
// non-capturing control plane: pure MIDI, no Accessibility, no input
// events, no screen access. Mirrors the lib/bin/ax-perform.swift pattern —
// built once: swiftc midi-send.swift -o midi-send ; .mjs shells to it.
//
// Usage:
//   midi-send <hexbyte> <hexbyte> ...           one message
//   midi-send --burst <hex,hex,...> <hex,...>   several messages, in order
//   midi-send --list                            print MIDI destinations
//
// A virtual SOURCE shows up as a MIDI input Logic can be assigned to under
// Control Surfaces. The bytes are delivered to whatever reads that source.

import CoreMIDI
import Foundation

func makeClientAndSource() -> (MIDIClientRef, MIDIEndpointRef)? {
    var client = MIDIClientRef()
    guard MIDIClientCreate("LogicAgentClient" as CFString, nil, nil, &client) == noErr else { return nil }
    var source = MIDIEndpointRef()
    guard MIDISourceCreate(client, "Logic Agent" as CFString, &source) == noErr else { return nil }
    return (client, source)
}

func send(_ source: MIDIEndpointRef, _ bytes: [UInt8]) {
    var packetList = MIDIPacketList()
    let pkt = MIDIPacketListInit(&packetList)
    _ = MIDIPacketListAdd(&packetList, 1024, pkt, 0, bytes.count, bytes)
    MIDIReceived(source, &packetList)
}

let args = Array(CommandLine.arguments.dropFirst())

if args.first == "--list" {
    let n = MIDIGetNumberOfDestinations()
    for i in 0..<n {
        let ep = MIDIGetDestination(i)
        var nameRef: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(ep, kMIDIPropertyDisplayName, &nameRef)
        let name = nameRef?.takeRetainedValue() as String? ?? "?"
        print("dest[\(i)] \(name)")
    }
    exit(0)
}

guard let (_, source) = makeClientAndSource() else {
    FileHandle.standardError.write("midi-send: failed to create CoreMIDI virtual source\n".data(using: .utf8)!)
    exit(2)
}
// Logic scans for the new virtual source asynchronously; give it a beat.
usleep(150_000)

func hexToBytes(_ s: String) -> [UInt8] {
    s.split(separator: ",").compactMap { UInt8($0.trimmingCharacters(in: .whitespaces), radix: 16) }
}

if args.first == "--burst" {
    for group in args.dropFirst() {
        send(source, hexToBytes(group))
        usleep(8_000)
    }
} else {
    let bytes = args.compactMap { UInt8($0, radix: 16) }
    if bytes.isEmpty {
        FileHandle.standardError.write("midi-send: no MIDI bytes\n".data(using: .utf8)!)
        exit(1)
    }
    send(source, bytes)
}
// Hold the source open briefly so the messages flush before the virtual
// endpoint is torn down on process exit.
usleep(120_000)

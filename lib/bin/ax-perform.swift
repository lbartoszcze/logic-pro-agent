// ax-perform — fire arbitrary AX actions on Logic Pro UI elements.
//
// Cua's `click` tool filters element actions down to a standard whitelist
// (press, show_menu, pick, confirm, cancel, open). Logic's per-channel
// plug-in slot AXButtons advertise a custom action whose name string is
// "Open plug-in menu with legacy plug-ins" — which is the only way to
// pop the plug-in chooser. This tool fires that action directly via
// ApplicationServices. Built once with `swiftc ax-perform.swift -o
// ax-perform`; logic.mjs shells out to the binary.
//
// Usage:
//   ax-perform <pid> <help-prefix> <slot-index> "<action-name>"
//   e.g. ax-perform 71817 "Audio Effect slot." 1 "Open plug-in menu with legacy plug-ins"
//
//   ax-perform --list <pid> <help-prefix>
//   e.g. ax-perform --list 71817 "Audio Effect slot."
//
//   ax-perform --hold <x> <y> <hold-ms>
//   Posts a mouse-down at screen point (x,y), sleeps hold-ms,
//   then mouse-up. Used for Logic's empty insert slots which
//   pop their plug-in chooser on click-and-hold rather than
//   a discrete click.

import ApplicationServices
import Foundation
import CoreGraphics

func die(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments

// --hold <x> <y> <ms> — post a mouseDown, sleep, mouseUp at screen point.
if args.count == 5 && args[1] == "--hold",
   let hx = Double(args[2]), let hy = Double(args[3]),
   let holdMs = Int(args[4]) {
  let pt = CGPoint(x: hx, y: hy)
  if let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left) {
    down.post(tap: .cghidEventTap)
  }
  usleep(useconds_t(holdMs * 1000))
  if let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left) {
    up.post(tap: .cghidEventTap)
  }
  print("hold-clicked (\(Int(hx)), \(Int(hy))) for \(holdMs)ms")
  exit(0)
}

let listMode = args.count == 4 && args[1] == "--list"
guard listMode || (args.count == 5 && pid_t(args[1]) != nil && Int(args[3]) != nil) else {
  die("usage:\n  ax-perform <pid> <help-prefix> <slot-index> <action-name>\n  ax-perform --list <pid> <help-prefix>\n  ax-perform --hold <x> <y> <ms>")
}
let pid: pid_t = listMode ? pid_t(args[2])! : pid_t(args[1])!
let helpPrefix: String = listMode ? args[3] : args[2]
let slotIndex: Int = listMode ? 0 : Int(args[3])!
let actionName: CFString = listMode ? "" as CFString : args[4] as CFString

let app = AXUIElementCreateApplication(pid)

var found: [AXUIElement] = []

func helpOf(_ elem: AXUIElement) -> String? {
  var raw: AnyObject?
  let err = AXUIElementCopyAttributeValue(elem, kAXHelpAttribute as CFString, &raw)
  guard err == .success, let s = raw as? String else { return nil }
  return s
}

func roleOf(_ elem: AXUIElement) -> String? {
  var raw: AnyObject?
  let err = AXUIElementCopyAttributeValue(elem, kAXRoleAttribute as CFString, &raw)
  guard err == .success, let s = raw as? String else { return nil }
  return s
}

func childrenOf(_ elem: AXUIElement) -> [AXUIElement] {
  var raw: AnyObject?
  let err = AXUIElementCopyAttributeValue(elem, kAXChildrenAttribute as CFString, &raw)
  guard err == .success, let arr = raw as? [AXUIElement] else { return [] }
  return arr
}

func walk(_ elem: AXUIElement) {
  if roleOf(elem) == kAXButtonRole as String,
     let h = helpOf(elem),
     h.hasPrefix(helpPrefix) {
    found.append(elem)
  }
  for c in childrenOf(elem) {
    walk(c)
  }
}

walk(app)

func positionOf(_ elem: AXUIElement) -> CGPoint? {
  var raw: AnyObject?
  let err = AXUIElementCopyAttributeValue(elem, kAXPositionAttribute as CFString, &raw)
  guard err == .success else { return nil }
  var pt = CGPoint.zero
  AXValueGetValue(raw as! AXValue, .cgPoint, &pt)
  return pt
}

if listMode {
  print("found \(found.count) buttons with help prefix \"\(helpPrefix)\":")
  for (i, e) in found.enumerated() {
    let pos = positionOf(e).map { "x=\(Int($0.x)),y=\(Int($0.y))" } ?? "no-pos"
    print("  \(i + 1): \(pos)")
  }
  exit(0)
}

guard slotIndex >= 1, slotIndex <= found.count else {
  die("slot \(slotIndex) out of range (found \(found.count) buttons matching prefix)")
}

let target = found[slotIndex - 1]
let err = AXUIElementPerformAction(target, actionName)
if err == .success {
  print("performed \"\(args[4])\" on slot \(slotIndex)/\(found.count)")
  exit(0)
}
die("AXUIElementPerformAction returned \(err.rawValue)")

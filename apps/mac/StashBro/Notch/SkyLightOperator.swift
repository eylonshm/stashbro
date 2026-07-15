// apps/mac/StashBro/Notch/SkyLightOperator.swift
// Vendored/adapted from Lakr233/SkyLightWindow (used by TheBoredTeam/boring.notch).
// Promotes a window into a private SkyLight space at an absolute level ABOVE the menu bar.
//
// Why not CGSSpace: on recent macOS (26.x / build 25F8x) a CGSSpace at Int32.max no longer
// composites above the menu bar status items - verified. The SkyLight (SLS) path does, because
// SLSSpaceAddWindowsAndRemoveFromSpaces REMOVES the window from its default space (the CGS
// add-only call left it in the default space, so the menu bar still won). SkyLight.framework is
// private and not linkable, so symbols are resolved at runtime via dlopen/dlsym.
import AppKit

final class SkyLightOperator {
    static let shared = SkyLightOperator()

    private let connection: Int32
    private let space: Int32
    private let addWindows: FAddWindowsAndRemove
    private let removeWindows: FRemoveWindows
    private let available: Bool

    private typealias FMainConnectionID = @convention(c) () -> Int32
    private typealias FSpaceCreate = @convention(c) (Int32, Int32, Int32) -> Int32
    private typealias FSpaceSetAbsoluteLevel = @convention(c) (Int32, Int32, Int32) -> Int32
    private typealias FShowSpaces = @convention(c) (Int32, CFArray) -> Int32
    private typealias FAddWindowsAndRemove = @convention(c) (Int32, Int32, CFArray, Int32) -> Int32
    private typealias FRemoveWindows = @convention(c) (Int32, CFArray, CFArray) -> Int32

    private init() {
        guard let h = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/SkyLight", RTLD_NOW),
              let pMainConn = dlsym(h, "SLSMainConnectionID"),
              let pSpaceCreate = dlsym(h, "SLSSpaceCreate"),
              let pSetLevel = dlsym(h, "SLSSpaceSetAbsoluteLevel"),
              let pShow = dlsym(h, "SLSShowSpaces"),
              let pAdd = dlsym(h, "SLSSpaceAddWindowsAndRemoveFromSpaces"),
              let pRemove = dlsym(h, "SLSRemoveWindowsFromSpaces")
        else {
            connection = 0; space = 0; available = false
            addWindows = { _, _, _, _ in 0 }
            removeWindows = { _, _, _ in 0 }
            return
        }
        let mainConn = unsafeBitCast(pMainConn, to: FMainConnectionID.self)
        let spaceCreate = unsafeBitCast(pSpaceCreate, to: FSpaceCreate.self)
        let setLevel = unsafeBitCast(pSetLevel, to: FSpaceSetAbsoluteLevel.self)
        let show = unsafeBitCast(pShow, to: FShowSpaces.self)
        addWindows = unsafeBitCast(pAdd, to: FAddWindowsAndRemove.self)
        removeWindows = unsafeBitCast(pRemove, to: FRemoveWindows.self)

        connection = mainConn()
        space = spaceCreate(connection, 1, 0)
        // Level 400 = kSLSSpaceAbsoluteLevelNotificationCenterAtScreenLock: a KNOWN-valid high
        // absolute level (used by SkyLightWindow) that sits above the menu bar. Int32.max got
        // clamped/ignored on this macOS, leaving the window at default level.
        _ = setLevel(connection, space, 400)
        _ = show(connection, [space] as CFArray)
        available = true
    }

    // Move the window into the high SkyLight space (and out of its default space).
    func delegate(_ window: NSWindow) {
        guard available else { return }
        _ = addWindows(connection, space, [window.windowNumber] as CFArray, 7)  // 7 per SkyLightWindow
    }

    func undelegate(_ window: NSWindow) {
        guard available else { return }
        _ = removeWindows(connection, [window.windowNumber] as CFArray, [space] as CFArray)
    }
}

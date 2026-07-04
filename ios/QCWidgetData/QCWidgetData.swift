import Foundation
import WidgetKit

@objc(QCWidgetData)
class QCWidgetData: NSObject {
  private let suiteName = "group.com.qualifiedcommercial.mobile"
  private let snapshotKey = "qc.widget.snapshot"

  @objc(setWidgetData:)
  func setWidgetData(_ json: String) {
    UserDefaults(suiteName: suiteName)?.set(json, forKey: snapshotKey)
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadTimelines(ofKind: "QualifiedCommercialMeetingsWidget")
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}


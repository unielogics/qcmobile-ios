import SwiftUI
import WidgetKit

struct QCWidgetMeeting: Codable, Identifiable {
  let id: String
  let title: String
  let starts_at: String
  let source: String?
  let deeplink: String?
}

struct QCWidgetSnapshot: Codable {
  let updated_at: String
  let meetings: [QCWidgetMeeting]
  let inbox_count: Int?
  let pipeline_count: Int?
}

struct QCWidgetEntry: TimelineEntry {
  let date: Date
  let snapshot: QCWidgetSnapshot?
}

struct QCWidgetProvider: TimelineProvider {
  private let suiteName = "group.com.qualifiedcommercial.mobile"
  private let snapshotKey = "qc.widget.snapshot"

  func placeholder(in context: Context) -> QCWidgetEntry {
    QCWidgetEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (QCWidgetEntry) -> Void) {
    completion(QCWidgetEntry(date: Date(), snapshot: readSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<QCWidgetEntry>) -> Void) {
    let entry = QCWidgetEntry(date: Date(), snapshot: readSnapshot())
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
  }

  private func readSnapshot() -> QCWidgetSnapshot? {
    guard
      let raw = UserDefaults(suiteName: suiteName)?.string(forKey: snapshotKey),
      let data = raw.data(using: .utf8)
    else {
      return nil
    }
    return try? JSONDecoder().decode(QCWidgetSnapshot.self, from: data)
  }
}

struct QualifiedCommercialMeetingsWidgetView: View {
  let entry: QCWidgetEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 3) {
          Text("Meetings")
            .font(.headline.weight(.bold))
            .foregroundStyle(.white)
          Text(updatedLabel)
            .font(.caption2)
            .foregroundStyle(Color(red: 0.65, green: 0.64, blue: 0.70))
        }
        Spacer()
        Link(destination: URL(string: "qcmobile://agent/(tabs)/calendar")!) {
          Image(systemName: "arrow.clockwise")
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(Color(red: 0.17, green: 0.16, blue: 0.19))
            .clipShape(Circle())
        }
      }

      HStack(spacing: 8) {
        Text("Meetings")
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          .background(Color.purple)
          .clipShape(Capsule())
        Text("Inbox")
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          .background(Color(red: 0.17, green: 0.16, blue: 0.19))
          .clipShape(Capsule())
        Link(destination: URL(string: "qcmobile://agent/(tabs)/pipeline")!) {
          Text("Pipeline")
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(Color(red: 0.17, green: 0.16, blue: 0.19))
            .clipShape(Capsule())
        }
      }
      .font(.caption.weight(.bold))
      .foregroundStyle(.white)

      if meetings.isEmpty {
        Spacer()
        Text("Open Qualified Commercial to sync upcoming meetings.")
          .font(.caption)
          .foregroundStyle(Color(red: 0.65, green: 0.64, blue: 0.70))
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
        Spacer()
      } else {
        VStack(spacing: 8) {
          ForEach(meetings) { meeting in
            Link(destination: URL(string: meeting.deeplink ?? "qcmobile://agent/(tabs)/calendar")!) {
              VStack(alignment: .leading, spacing: 4) {
                Text(meeting.title)
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(.white)
                  .lineLimit(1)
                Text(meta(for: meeting))
                  .font(.caption2)
                  .foregroundStyle(Color(red: 0.65, green: 0.64, blue: 0.70))
                  .lineLimit(1)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(10)
              .background(Color(red: 0.17, green: 0.16, blue: 0.19))
              .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
          }
        }
      }
    }
    .padding(14)
    .background(Color(red: 0.08, green: 0.08, blue: 0.10))
  }

  private var meetings: [QCWidgetMeeting] {
    Array((entry.snapshot?.meetings ?? []).prefix(3))
  }

  private var updatedLabel: String {
    guard let updated = entry.snapshot?.updated_at else { return "Open app to sync" }
    return "Updated \(shortDate(updated))"
  }

  private func meta(for meeting: QCWidgetMeeting) -> String {
    [shortDate(meeting.starts_at), meeting.source].compactMap { value in
      guard let value, !value.isEmpty else { return nil }
      return value
    }.joined(separator: " - ")
  }

  private func shortDate(_ raw: String) -> String {
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: raw) else { return "" }
    return date.formatted(.dateTime.weekday(.abbreviated).hour().minute())
  }
}

@main
struct QualifiedCommercialMeetingsWidget: Widget {
  let kind = "QualifiedCommercialMeetingsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: QCWidgetProvider()) { entry in
      QualifiedCommercialMeetingsWidgetView(entry: entry)
    }
    .configurationDisplayName("Qualified Commercial")
    .description("Upcoming meetings and pipeline status.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

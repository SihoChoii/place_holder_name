import SwiftUI

enum AppTheme {
  static let background = Color.black
  static let surface = Color(white: 10.0 / 255)
  static let overlay = Color(white: 20.0 / 255)
  static let secondary = Color(white: 163.0 / 255)
  static let border = Color(white: 41.0 / 255)
  static func font(
    _ size: CGFloat = 17, weight: Font.Weight = .regular, relativeTo: Font.TextStyle = .body
  ) -> Font {
    if UIFont(name: "Inter-Regular", size: size) != nil {
      return .custom("Inter-Regular", size: size, relativeTo: relativeTo).weight(weight)
    }
    return .system(relativeTo).weight(weight)
  }
}
struct PrimaryButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(AppTheme.font(weight: .semibold)).frame(
      maxWidth: .infinity, minHeight: 48
    )
    .foregroundStyle(.black).background(.white.opacity(configuration.isPressed ? 0.7 : 1))
  }
}
struct SecondaryButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.frame(minHeight: 44).padding(.horizontal, 12).foregroundStyle(.white)
      .background(configuration.isPressed ? AppTheme.overlay : .clear).overlay(
        Rectangle().stroke(Color(white: 0.45)))
  }
}
struct FactRow: View {
  let label: String
  let value: String
  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label).foregroundStyle(AppTheme.secondary)
      Spacer()
      Text(value).multilineTextAlignment(.trailing).monospacedDigit()
    }
    .font(AppTheme.font(14, relativeTo: .subheadline)).padding(.vertical, 12)
    .overlay(alignment: .bottom) { Rectangle().fill(AppTheme.border).frame(height: 1) }
  }
}
struct StatusMessage: View {
  let message: String
  var body: some View {
    Label(message, systemImage: "info.circle").font(.callout).foregroundStyle(AppTheme.secondary)
      .accessibilityElement(children: .combine).padding(.vertical, 8)
  }
}
extension View {
  func appField() -> some View {
    padding(12).frame(minHeight: 48).background(AppTheme.overlay).overlay(
      Rectangle().stroke(Color(white: 0.45)))
  }
  func appScreen() -> some View {
    background(AppTheme.background).preferredColorScheme(.dark).tint(.white).font(AppTheme.font())
  }
}

import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var mode: Mode = .login
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false

    enum Mode { case login, register }

    var body: some View {
        NavigationStack {
            Form {
                if session.isLoggedIn {
                    Section("Signed in") {
                        if let user = session.user {
                            LabeledContent("Username", value: "@\(user.username)")
                            LabeledContent("Email", value: user.email)
                        } else {
                            Text("Token saved on this device.")
                        }
                        Button("Log out", role: .destructive) {
                            session.logout()
                        }
                    }
                } else {
                    Section {
                        Picker("Mode", selection: $mode) {
                            Text("Log in").tag(Mode.login)
                            Text("Sign up").tag(Mode.register)
                        }
                        .pickerStyle(.segmented)

                        TextField("Email", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                        if mode == .register {
                            TextField("Username", text: $username)
                                .textInputAutocapitalization(.never)
                        }
                        SecureField("Password", text: $password)
                    }

                    Section {
                        Button {
                            Task {
                                busy = true
                                if mode == .login {
                                    await session.login(email: email, password: password)
                                } else {
                                    await session.register(email: email, username: username, password: password)
                                }
                                busy = false
                            }
                        } label: {
                            if busy { ProgressView() } else { Text(mode == .login ? "Log in" : "Create account") }
                        }
                        .disabled(busy || email.isEmpty || password.count < 8)
                    }

                    if let error = session.lastError {
                        Section {
                            Text(error).foregroundStyle(.red)
                        }
                    }
                }

                Section("API") {
                    Text(APIClient.baseURL.absoluteString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("On a physical device, set APIClient.baseURL to your Mac's LAN IP.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Account")
        }
    }
}

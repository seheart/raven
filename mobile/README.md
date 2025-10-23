# 📱 Raven Mobile

> Monitor your AI coding agents from anywhere with Raven Mobile

React Native app for monitoring Raven-tracked projects in real-time from your phone.

## ✨ Features

- 🔌 **Easy Connection** - Connect to your Raven backend via local WiFi
- 📊 **Multi-Project Support** - Monitor all 13+ projects from one app
- 📝 **Live Event Feed** - Real-time file changes and events
- 📈 **System Metrics** - CPU and memory usage monitoring
- 🎨 **Color-Coded Projects** - Tokyo Night theme matching web UI
- ⚡ **WebSocket Updates** - Instant notifications of changes

## 🚀 Quick Start

### Prerequisites

1. **Raven backend running** on your computer (port 3030)
2. **Same WiFi network** - phone and computer must be connected to the same WiFi
3. **Expo Go app** installed on your phone:
   - iOS: [Download from App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Download from Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npx expo start
```

This will display a QR code in your terminal.

### Connect Your Phone

1. Open **Expo Go** app on your phone
2. Scan the QR code from the terminal
3. Wait for the app to load

### Connect to Raven Backend

1. Find your computer's local IP address:
   - **macOS/Linux**: `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - **Windows**: `ipconfig` (look for IPv4 Address)

2. In the app, enter:
   - IP Address: `192.168.1.XXX` (your computer's IP)
   - Port: `3030` (default Raven backend port)

3. Tap **Connect**

4. Select a project to monitor

5. Enjoy real-time monitoring! 🎉

## 📱 Screens

### Connection Screen
- Enter backend IP and port
- Auto-saves last connection
- Connection validation

### Project List
- All monitored projects
- File count and event stats
- Pull to refresh
- Tap to select project

### Event Feed (Main Tab)
- Live event stream
- Color-coded by event type
- Connection status indicator
- Pull to refresh

### Metrics Tab
- Real-time CPU usage
- Memory usage with progress bars
- System uptime
- Auto-updates every 5 seconds

## 🛠️ Tech Stack

- **React Native** - Cross-platform mobile framework
- **Expo** - Development platform
- **Socket.IO Client** - Real-time WebSocket connection
- **React Navigation** - Navigation between screens
- **AsyncStorage** - Persistent data storage

## 🔧 Troubleshooting

### Can't Connect to Backend

**Problem:** "Connection Failed" error

**Solutions:**
1. Make sure Raven backend is running (`./start.sh` in raven directory)
2. Verify phone and computer are on the **same WiFi network**
3. Check your computer's IP hasn't changed (try reconnecting)
4. Test backend is accessible: open `http://YOUR_IP:3030` in phone's browser
5. Check firewall isn't blocking port 3030

### QR Code Won't Scan

**Problem:** Expo Go can't scan QR code

**Solutions:**
1. Make sure the QR code is fully visible on screen
2. Try the "Enter URL manually" option in Expo Go
3. Use the tunnel mode: `npx expo start --tunnel`

### Events Not Appearing

**Problem:** Event feed shows "No events yet"

**Solutions:**
1. Make some changes in the monitored project
2. Check the "Live" indicator is green (connected)
3. Pull down to refresh the feed
4. Verify the project is being monitored by Raven

## 📦 Project Structure

```
mobile/
├── App.js                    # Main entry point
├── src/
│   ├── screens/              # App screens
│   │   ├── ConnectionScreen.js
│   │   ├── ProjectListScreen.js
│   │   ├── EventFeedScreen.js
│   │   └── MetricsScreen.js
│   ├── components/           # Reusable components
│   │   ├── ProjectBadge.js
│   │   └── EventCard.js
│   ├── services/             # Backend communication
│   │   └── RavenService.js
│   ├── navigation/           # Navigation setup
│   │   └── AppNavigator.js
│   └── utils/                # Constants & helpers
│       ├── colors.js
│       └── constants.js
└── package.json
```

## 🎨 Design

The mobile app uses the same **Tokyo Night** color palette as the Raven web UI for consistency:

- Background: `#1a1b26`
- Surface: `#24283b`
- Primary: `#7aa2f7` (blue)
- Text: `#c0caf5`

## 🚧 Future Enhancements

- [ ] Push notifications for important events
- [ ] Diff viewer for file changes
- [ ] Search and filter events
- [ ] Dark/light theme toggle
- [ ] Remote control (pause monitoring, etc.)
- [ ] Multiple backend support
- [ ] Offline mode with cached data

## 📄 License

MIT - Same as main Raven project

---

**Built with ❤️ for AI agent monitoring**

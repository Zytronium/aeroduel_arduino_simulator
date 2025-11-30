# Aeroduel Arduino Simulator

A web-based GUI that simulates (in a browser) what the ESP32-based Arduinos will do onboard Aeroduel RC planes.  
Use it to interactively test and iterate on the API endpoints provided by the [Aeroduel Server](https://github.com/Aeroduel/server) before hardware is available or deployed.

> Instead of flashing firmware or wiring up hardware for every test, this simulator lets you mimic the ESP32 behavior, send the same requests the microcontrollers would send, and visualize responses from the Aeroduel backend.

---

## Table of Contents

- [TLDR](#summary)
- [Features](#features)
- [Project Goals](#project-goals)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Running in Development](#running-in-development)
    - [Building for Production](#building-for-production)
    - [Previewing a Production Build](#previewing-a-production-build)
- [How It Works](#how-it-works)
- [Using the Simulator](#using-the-simulator)
    - [Typical Workflow](#typical-workflow)
- [Development Notes](#development-notes)

---

## Summary
The Aeroduel Arduino Simulator is a web-based GUI that simulates what the 
on-board ESP32 Arduinos will do onboard the RC planes by providing a control
panel for sending the HTTP requests that the ESP32s will be sending. It is a
method of testing the API without having to set up everything on the RC plane,
and is the only way to test these API endpoints while the RC planes are not
yet ready for the testing phase of Aeroduel's development.

---

## Features

- **ESP32 behavior simulation**
    - Mimics the network behavior of the ESP32 Arduinos installed on RC planes.
    - Lets you exercise the same API flows that firmware will use.

- **Aeroduel Server integration**
    - Sends requests to the same HTTP endpoints exposed by the [Aeroduel Server](https://github.com/Aeroduel/server).
    - Helps verify request/response formats, status codes, and error handling.

- **Interactive web UI**
    - Run scenarios that would normally require a powered plane and radio link.
    - Inspect server responses in a human-friendly way.

- **Fast feedback loop for backend & firmware teams**
    - Backend developers can test new endpoints without waiting for firmware changes.
    - Firmware developers can confirm server expectations and refine payload structures.

---

## Project Goals

This project is intended to:

- Provide a testing environment for the Aeroduel Server's ESP32-facing API endpoints.
- Reduce the amount of on-hardware debugging required for integration.
- Make it easier to:
    - Experiment with new endpoints and payloads.
    - Reproduce bugs and race conditions seen in the field.
    - Share reproducible scenarios across contributors.

---

## Tech Stack

- **Frontend:** React
- **Build Tool / Dev Server:** Vite
- **Styling:** Tailwind CSS v4
- **Icons:** `lucide-react`

The app is a single-page application that runs in the browser and communicates 
with the Aeroduel Server via HTTP.

---

## Getting Started

### Prerequisites

- **Node.js** (LTS recommended, e.g. ≥ 22.x)
- **npm** (comes with Node.js)

You'll need a local instance of the **Aeroduel Server** running as well.  
See: [https://github.com/Aeroduel/server](https://github.com/Aeroduel/server).

### Installation

Clone the repository and install dependencies:

```shell script
git clone https://github.com/Zytronium/aeroduel_arduino_simulator.git
cd aeroduel_arduino_simulator

# Install dependencies
npm install
```

### Running in Development

Start the Vite dev server:

```shell script
npm run dev
```


Vite will print a local URL, usually something like:

- `http://localhost:5173`

Open that URL in your browser to use the simulator.

### Building for Production

Create an optimized production build:

```shell script
npm run build
```


This generates static assets in the `dist/` directory.

### Previewing a Production Build

To serve the production build locally:

```shell script
npm run preview
```


Vite will start a local server that serves the built assets (default URL is often `http://localhost:4173`).

---

## How It Works

At a high level:

1. The GUI exposes **two simulated ESP32 planes**, each with:
   - A fixed plane ID
   - A fixed user ID
   - A fixed ESP32 IP address
   - A connection/registration status and (once registered) an auth token

2. Each plane can trigger a small set of actions via buttons in the UI:

   - **Register (`POST /api/register`)**

     When you click "Power On & Register" for a plane, the simulator sends a `POST` request to:

     - `http://aeroduel.local:45045/api/register`

     With a JSON body like:

     ```json
     {
       "planeId": "<plane-id>",
       "esp32Ip": "<esp32-ip>",
       "userId": "<user-id>"
     }
     ```

     If the response is successful and returns an `authToken`, the plane is marked as online, the token is stored, and the status label updates to "Online."

   - **Hit (`POST /api/hit`)**

     When a plane is online and has an auth token, clicking "Fire at Plane X" sends a `POST` request to:

     - `http://aeroduel.local:45045/api/hit`

     With a JSON body like:

     ```json
     {
       "authToken": "<auth-token>",
       "planeId": "<shooter-plane-id>",
       "targetId": "<target-plane-id>"
     }
     ```

     If the request succeeds, the activity log records that a hit was registered on the target plane.

   - **Teapot test (`POST /api/fire`)**

     Clicking "🫖 Try /api/fire (Teapot)" for a plane sends a `POST` request to:

     - `http://aeroduel.local:45045/api/fire`

     With a JSON body like:

     ```json
     {
       "planeId": "<plane-id>",
       "targetId": "<other-plane-id>"
     }
     ```

     The response (including status code and any `error` message) is logged to the activity log. This is mainly a joke endpoint that always returns a 418, which in itself is a joke error code.

3. All outcomes are displayed in an **Activity Log** at the bottom of the page, showing:
   - Which plane triggered the action
   - A timestamp
   - Whether it was treated as success or error
   - A short, human-readable message

This setup allows you to:

- Verify that `/api/register`, `/api/hit`, and `/api/fire` behave as expected for two simulated planes.
- Check that auth token handling and basic hit flows work end-to-end without real hardware.

---

## Using the Simulator

You'll see the following main parts in the UI:

- **Header**
  - Title: "Aeroduel ESP32 Simulator"
  - Subtitle: "Test server endpoints with simulated ESP32 planes"
  - Server label: the fixed server URL (`http://aeroduel.local:45045`)

- **Two ESP32 Simulator Panels**
  - Each represents one simulated plane:
    - Displays:
      - Plane ID
      - User ID
      - ESP32 IP
      - Status badge (e.g., "Offline", "Registering…", "Online")
      - Auth token (truncated) once registered
    - Buttons:
      - **Power On & Register**
        - Calls `/api/register` for that plane.
        - Disabled once the plane is online.
      - **Fire at Plane X**
        - Calls `/api/hit` with this plane as shooter and the other as target.
        - Disabled while the plane is offline or not yet registered.
      - **🫖 Try /api/fire (Teapot)**
        - Calls `/api/fire` to test the behavior of that endpoint.

- **Activity Log**
  - A scrollable list that shows the last ~20 events.
  - Each entry includes:
    - The plane label (e.g., "Plane 1" or "Plane 2")
    - Timestamp
    - Message text
    - Visual styling for success vs error

### Typical Workflow

1. **Start the Aeroduel Server**  
   Make sure the server is running and reachable at `http://aeroduel.local:45045` (or adjust the source code if your server runs elsewhere).

2. **Start this simulator and open it in the browser.**

   ```bash
   npm install
   npm run dev
   ```

3. **Register both planes**
   - Click "Power On & Register" on Plane 1.
   - Click "Power On & Register" on Plane 2.
   - Confirm that each shows status "Online" and that auth tokens are displayed (truncated).

4. **Create and start new match on Aeroduel Server application**
    - Navigate to the Aeroduel Server application.
    - Create a new match with two players.
    - Have both planes join the match. (there is no way to do this yet without manually sending an HTTP request to api/join-match. Using Postman or similar is recommended. See [API documentation for this POST /api/join-match](https://github.com/Aeroduel/server/blob/main/docs/API.md#post-apijoin-match))
    - Start the match.

5. **Test hit registration**
   - On Plane 1, click "Fire at Plane 2."
   - On Plane 2, click "Fire at Plane 1."
   - Watch the Activity Log for hit success messages or error messages.

6. **Test the teapot endpoint**
   - On either plane, click "🫖 Try /api/fire (Teapot)."
   - Observe the logged status code and error message from the server.

7. **Iterate on the server behavior**
   - Adjust the Aeroduel Server's implementation of `/api/register`, `/api/hit`, or `/api/fire`.
   - Re-run the same button flows from the simulator to verify your changes.

---

## Development Notes

- The project is structured as a small React SPA powered by Vite.
- Tailwind CSS is used for styling, making it easy to:
    - Tweak layouts and colors in JSX.
    - Keep styling co-located with components.

Common tasks:

- **Code formatting / linting**
    - If the project later adds tooling (ESLint, Prettier, etc.), follow those configs and run their scripts before committing.

- **Dependency updates**
    - Use `npm outdated` and `npm update` as needed.
    - Be mindful of breaking changes in React, Vite, or Tailwind, especially around major version bumps.

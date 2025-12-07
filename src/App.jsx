import React, { useState, useRef, useEffect } from 'react';
import { Power, Crosshair, Wifi, AlertCircle, CheckCircle } from 'lucide-react';

const ESP32Simulator = () => {
    const [plane1, setPlane1] = useState({
        planeId: 'sim-plane-001',
        userId: 'sim-user-001',
        esp32Ip: '192.168.1.101',
        isOnline: false,
        authToken: null,
        wsConnected: false,
        status: 'Offline'
    });

    const [plane2, setPlane2] = useState({
        planeId: 'sim-plane-002',
        userId: 'sim-user-002',
        esp32Ip: '192.168.1.102',
        isOnline: false,
        authToken: null,
        wsConnected: false,
        status: 'Offline'
    });

    const [serverUrl] = useState('http://aeroduel.local:45045');
    const [wsUrl] = useState('ws://aeroduel.local:45046');
    const [logs, setLogs] = useState([]);
    const [debugData, setDebugData] = useState(null);
    const [showDebug, setShowDebug] = useState(false);

    const wsRefs = useRef({ 1: null, 2: null });

    const addLog = (plane, message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [{ plane, message, type, timestamp }, ...prev].slice(0, 20));
    };

    const setupWebSocket = ({ planeNum, planeId, authToken }) => {
        const setPlane = planeNum === 1 ? setPlane1 : setPlane2;

        if (wsRefs.current[planeNum]) {
            try {
                wsRefs.current[planeNum].close();
            } catch {
                // ignore
            }
        }

        addLog(`Plane ${planeNum}`, `Connecting WebSocket: ${wsUrl}`, 'info');

        const ws = new WebSocket(wsUrl);
        wsRefs.current[planeNum] = ws;

        ws.addEventListener('open', () => {
            ws.send(
                JSON.stringify({
                    type: 'hello',
                    role: 'arduino',
                    planeId,
                    authToken
                })
            );

            setPlane(prev => ({
                ...prev,
                wsConnected: true,
                status: 'Online (WS Connecting)'
            }));
            addLog(`Plane ${planeNum}`, 'WebSocket connection opened; hello sent.', 'success');
        });

        ws.addEventListener('message', (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                addLog(`Plane ${planeNum}`, `Received non-JSON WS message: ${event.data}`, 'error');
                return;
            }

            switch (msg.type) {
                case 'system:ack':
                    setPlane(prev => ({
                        ...prev,
                        wsConnected: true,
                        status: 'Online (WS Authenticated)'
                    }));
                    addLog(`Plane ${planeNum}`, 'WebSocket authenticated (system:ack).', 'success');
                    break;

                case 'system:error':
                    addLog(`Plane ${planeNum}`, `System error: ${msg.error}`, 'error');
                    setPlane(prev => ({
                        ...prev,
                        wsConnected: false,
                        status: 'Online (WS Error)'
                    }));
                    break;

                case 'match:state':
                    setDebugData({ type: `Match State (Plane ${planeNum})`, data: msg });
                    setShowDebug(true);
                    addLog(`Plane ${planeNum}`, `Match state: ${msg.data?.status || 'unknown'}`, 'info');
                    break;

                case 'plane:flash':
                    addLog(
                        `Plane ${planeNum}`,
                        `Flash command received! Hit by ${msg.data?.byPlaneId || 'unknown'}`,
                        'info'
                    );
                    setDebugData({ type: `Flash Command (Plane ${planeNum})`, data: msg });
                    setShowDebug(true);
                    break;

                case 'plane:kicked':
                    addLog(
                        `Plane ${planeNum}`,
                        `Kicked from match: ${msg.data?.reason || 'unknown reason'}`,
                        'error'
                    );
                    setPlane(prev => ({
                        ...prev,
                        wsConnected: false,
                        status: 'Kicked'
                    }));
                    break;

                case 'plane:disqualified':
                    addLog(
                        `Plane ${planeNum}`,
                        `Disqualified: ${msg.data?.reason || 'unknown reason'}`,
                        'error'
                    );
                    setPlane(prev => ({
                        ...prev,
                        status: 'Disqualified'
                    }));
                    break;

                default:
                    addLog(
                        `Plane ${planeNum}`,
                        `Received unknown WS message type "${msg.type}".`,
                        'info'
                    );
            }
        });

        ws.addEventListener('close', () => {
            setPlane(prev => ({
                ...prev,
                wsConnected: false,
                status: prev.isOnline ? 'Online (WS Closed)' : 'Offline'
            }));
            addLog(`Plane ${planeNum}`, 'WebSocket connection closed.', 'info');
            wsRefs.current[planeNum] = null;
        });

        ws.addEventListener('error', (err) => {
            addLog(`Plane ${planeNum}`, `WebSocket error: ${err?.message || 'unknown error'}`, 'error');
        });
    };

    const handleRegister = async (planeNum) => {
        const plane = planeNum === 1 ? plane1 : plane2;
        const setPlane = planeNum === 1 ? setPlane1 : setPlane2;

        try {
            setPlane(prev => ({ ...prev, status: 'Registering...' }));

            const response = await fetch(`${serverUrl}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planeId: plane.planeId,
                    esp32Ip: plane.esp32Ip,
                    userId: plane.userId
                })
            });

            const data = await response.json();

            if (response.ok) {
                setPlane(prev => ({
                    ...prev,
                    isOnline: true,
                    authToken: data.authToken,
                    status: 'Online'
                }));
                addLog(`Plane ${planeNum}`, `Registered successfully. Auth token: ${data.authToken.substring(0, 8)}...`, 'success');

                // Connect WebSocket after successful registration
                setupWebSocket({
                    planeNum,
                    planeId: plane.planeId,
                    authToken: data.authToken
                });
            } else {
                throw new Error(data.error || 'Registration failed');
            }
        } catch (error) {
            setPlane(prev => ({ ...prev, status: 'Offline', isOnline: false, wsConnected: false }));
            addLog(`Plane ${planeNum}`, `Registration failed: ${error.message}`, 'error');
        }
    };

    const handleUnregister = (planeNum) => {
        const setPlane = planeNum === 1 ? setPlane1 : setPlane2;

        setPlane(prev => ({ ...prev, status: 'Powering off...' }));

        // Simply close the WebSocket connection
        // The server will handle the disconnect and mark the plane as offline
        if (wsRefs.current[planeNum]) {
            try {
                wsRefs.current[planeNum].close();
                wsRefs.current[planeNum] = null;
            } catch {
                // ignore
            }
        }

        setPlane(prev => ({
            ...prev,
            isOnline: false,
            authToken: null,
            wsConnected: false,
            status: 'Offline'
        }));
        addLog(`Plane ${planeNum}`, 'Powered off (WebSocket closed).', 'success');
    };

    const handleFire = async (shooterNum, targetNum) => {
        const shooter = shooterNum === 1 ? plane1 : plane2;
        const target = targetNum === 1 ? plane1 : plane2;

        if (!shooter.isOnline || !shooter.authToken) {
            addLog(`Plane ${shooterNum}`, 'Cannot fire: Plane is offline or not registered', 'error');
            return;
        }

        try {
            const response = await fetch(`${serverUrl}/api/hit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    authToken: shooter.authToken,
                    planeId: shooter.planeId,
                    targetId: target.planeId
                })
            });

            const data = await response.json();

            if (response.ok) {
                addLog(`Plane ${shooterNum}`, `Hit registered on Plane ${targetNum}!`, 'success');
            } else {
                throw new Error(data.error || 'Hit registration failed');
            }
        } catch (error) {
            addLog(`Plane ${shooterNum}`, `Hit failed: ${error.message}`, 'error');
        }
    };

    const handleTeapot = async (planeNum) => {
        const plane = planeNum === 1 ? plane1 : plane2;
        const target = planeNum === 1 ? plane2 : plane1;

        try {
            const response = await fetch(`${serverUrl}/api/fire`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planeId: plane.planeId,
                    targetId: target.planeId
                })
            });

            const data = await response.json();
            addLog(`Plane ${planeNum}`, `Response ${response.status}: ${data.error}`, 'error');
        } catch (error) {
            addLog(`Plane ${planeNum}`, `Error: ${error.message}`, 'error');
        }
    };

    const fetchMatchState = async () => {
        try {
            const response = await fetch(`${serverUrl}/api/match`);
            const data = await response.json();
            setDebugData({ type: 'Match State', data });
            setShowDebug(true);
            addLog('Debug', 'Fetched match state', 'info');
        } catch (error) {
            addLog('Debug', `Failed to fetch match state: ${error.message}`, 'error');
        }
    };

    const fetchPlanes = async () => {
        try {
            const response = await fetch(`${serverUrl}/api/planes`);
            const data = await response.json();
            setDebugData({ type: 'Online Planes', data });
            setShowDebug(true);
            addLog('Debug', 'Fetched planes list', 'info');
        } catch (error) {
            addLog('Debug', `Failed to fetch planes: ${error.message}`, 'error');
        }
    };

    const PlaneControl = ({ planeNum, plane, setPlane }) => {
        const targetNum = planeNum === 1 ? 2 : 1;

        return (
            <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-200">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">ESP32 Simulator #{planeNum}</h2>
                    <div className="flex flex-col items-end gap-1">
                        <div
                            className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                                plane.isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}
                        >
                            <Wifi className="w-4 h-4" />
                            <span className="text-sm font-medium">{plane.status}</span>
                        </div>
                        <span
                            className={`text-xs font-mono ${
                                plane.wsConnected ? 'text-green-600' : 'text-gray-400'
                            }`}
                        >
              WS: {plane.wsConnected ? 'Connected' : 'Disconnected'}
            </span>
                    </div>
                </div>

                <div className="space-y-3 mb-6 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-600">Plane ID:</span>
                        <span className="font-mono text-gray-900">{plane.planeId}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">User ID:</span>
                        <span className="font-mono text-gray-900">{plane.userId}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">ESP32 IP:</span>
                        <span className="font-mono text-gray-900">{plane.esp32Ip}</span>
                    </div>
                    {plane.authToken && (
                        <div className="flex justify-between">
                            <span className="text-gray-600">Auth Token:</span>
                            <span className="font-mono text-xs text-gray-700">{plane.authToken.substring(0, 12)}...</span>
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => handleRegister(planeNum)}
                        disabled={plane.isOnline}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                            plane.isOnline
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        <Power className="w-5 h-5" />
                        {plane.isOnline ? 'Already Online' : 'Power On & Register'}
                    </button>

                    <button
                        onClick={() => handleUnregister(planeNum)}
                        disabled={!plane.isOnline}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                            !plane.isOnline
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-slate-700 text-white hover:bg-slate-800'
                        }`}
                    >
                        <Power className="w-5 h-5" />
                        Power Off & Unregister
                    </button>

                    <button
                        onClick={() => handleFire(planeNum, targetNum)}
                        disabled={!plane.isOnline}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                            !plane.isOnline
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                    >
                        <Crosshair className="w-5 h-5" />
                        Fire at Plane {targetNum}
                    </button>

                    <button
                        onClick={() => handleTeapot(planeNum)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                    >
                        🫖 Try /api/fire (Teapot)
                    </button>
                </div>
            </div>
        );
    };

    useEffect(() => {
        return () => {
            Object.values(wsRefs.current).forEach((ws) => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try {
                        ws.close();
                    } catch {
                        // ignore
                    }
                }
            });
        };
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Aeroduel ESP32 Simulator</h1>
                    <p className="text-gray-600">Test server endpoints with simulated ESP32 planes</p>
                    <p className="text-sm text-gray-500 mt-2">Server: {serverUrl} | WebSocket: {wsUrl}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <PlaneControl planeNum={1} plane={plane1} setPlane={setPlane1} />
                    <PlaneControl planeNum={2} plane={plane2} setPlane={setPlane2} />
                </div>

                <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-200 mb-8">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Debug Tools</h3>
                    <div className="flex gap-4">
                        <button
                            onClick={fetchMatchState}
                            className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                        >
                            View Match State
                        </button>
                        <button
                            onClick={fetchPlanes}
                            className="flex-1 px-4 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
                        >
                            View Online Planes
                        </button>
                    </div>
                </div>

                {showDebug && debugData && (
                    <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-indigo-200 mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-gray-800">{debugData.type}</h3>
                            <button
                                onClick={() => setShowDebug(false)}
                                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(debugData.data, null, 2)}
            </pre>
                    </div>
                )}

                <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-200">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Activity Log</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {logs.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No activity yet. Start by registering a plane!</p>
                        ) : (
                            logs.map((log, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-start gap-3 p-3 rounded-lg ${
                                        log.type === 'success'
                                            ? 'bg-green-50 border border-green-200'
                                            : log.type === 'error'
                                                ? 'bg-red-50 border border-red-200'
                                                : 'bg-blue-50 border border-blue-200'
                                    }`}
                                >
                                    {log.type === 'success' ? (
                                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-sm text-gray-700">{log.plane}</span>
                                            <span className="text-xs text-gray-500">{log.timestamp}</span>
                                        </div>
                                        <p className="text-sm text-gray-800">{log.message}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ESP32Simulator;
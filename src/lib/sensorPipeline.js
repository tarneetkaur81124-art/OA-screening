// TODO (hardware team): fill in your ESP32's actual advertised name and
// GATT service/characteristic UUIDs from your firmware, then implement the
// real characteristic reads in readSensorReadings(). This is the single
// handoff point between the frontend and the sensor kit — once it's wired
// up, nothing else in the UI needs to change.

export async function connectSensorKit() {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not supported in this browser. Use Chrome on Android.')
  }
  const device = await navigator.bluetooth.requestDevice({
    // TODO: replace with your ESP32's actual advertised name or service UUID
    filters: [{ namePrefix: 'ESP32' }],
    optionalServices: [] // TODO: add your GATT service UUID here
  })
  return device
}

// Suggested shape to return once implemented:
//   { kneeFlexionDeg: number, strideAsymmetry: number, cadence: number }
export async function readSensorReadings(device) {
  console.warn('readSensorReadings() is a stub — wire up real GATT characteristic reads here.')
  await new Promise((resolve) => setTimeout(resolve, 600))
  return { status: 'pending', note: 'Sensor pipeline not yet connected — placeholder output.' }
}

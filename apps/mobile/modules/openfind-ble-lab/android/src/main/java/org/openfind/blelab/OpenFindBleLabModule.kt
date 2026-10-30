package org.openfind.blelab

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/** Foreground-only diagnostic, not the OpenFind finding protocol. */
class OpenFindBleLabModule : Module() {
  private val service = ParcelUuid(UUID.fromString("5df34e4a-5f45-42ef-9440-2f23d0be93de"))
  private val handler = Handler(Looper.getMainLooper())
  private var scanner: BluetoothLeScanner? = null
  private var scanCallback: ScanCallback? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var lastDetectionMs = 0L
  private val timeout = Runnable {
    stopAll()
    sendEvent("onLabEvent", mapOf("kind" to "stopped", "message" to "Test stopped after 60 seconds."))
  }

  override fun definition() = ModuleDefinition {
    Name("OpenFindBleLab")
    Events("onLabEvent")
    Function("getCapabilities") { getCapabilities() }
    Function("startBroadcast") { startBroadcast() }
    Function("startScan") { startScan() }
    Function("stop") { stopAll() }
    OnActivityEntersBackground { stopAll() }
    OnDestroy { stopAll() }
  }

  private fun context(): Context = requireNotNull(appContext.reactContext)

  private fun hasPermission(permission: String): Boolean =
    context().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  /** Read-only best-effort status. Unknown is distinct from unsupported/off. */
  @SuppressLint("MissingPermission")
  private fun getCapabilities(): Map<String, Boolean?> {
    val bleSupported = try {
      context().packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    } catch (_: Exception) { null }
    val canReadAdapter = try {
      Build.VERSION.SDK_INT < 31 || hasPermission(Manifest.permission.BLUETOOTH_CONNECT)
    } catch (_: Exception) { false }
    if (!canReadAdapter) {
      return mapOf("bleSupported" to bleSupported, "bluetoothEnabled" to null, "advertisingSupported" to null)
    }
    return try {
      val manager = context().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      val adapter = manager?.adapter
      val enabled = adapter?.isEnabled
      val advertising = if (enabled == true) adapter?.isMultipleAdvertisementSupported else null
      mapOf("bleSupported" to bleSupported, "bluetoothEnabled" to enabled, "advertisingSupported" to advertising)
    } catch (_: Exception) {
      mapOf("bleSupported" to bleSupported, "bluetoothEnabled" to null, "advertisingSupported" to null)
    }
  }

  private fun error(message: String): String {
    sendEvent("onLabEvent", mapOf("kind" to "error", "message" to message))
    return "error"
  }

  @Synchronized
  @SuppressLint("MissingPermission")
  private fun startBroadcast(): String {
    stopAll()
    if (Build.VERSION.SDK_INT >= 31 &&
      (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT) ||
       !hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE))) {
      return error("Nearby devices permission is required to broadcast.")
    }
    return try {
      val manager = context().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        ?: return error("Bluetooth is unavailable on this phone.")
      val adapter = manager.adapter ?: return error("Bluetooth is unavailable on this phone.")
      if (!adapter.isEnabled) return error("Turn Bluetooth on and try again.")
      val instance = adapter.bluetoothLeAdvertiser
        ?: return error("This phone does not support BLE advertising or Bluetooth is off.")
      val callback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
          synchronized(this@OpenFindBleLabModule) {
            if (advertiseCallback !== this) return
            sendEvent("onLabEvent", mapOf("kind" to "broadcasting", "message" to "Test beacon is broadcasting."))
          }
        }
        override fun onStartFailure(errorCode: Int) {
          synchronized(this@OpenFindBleLabModule) {
            if (advertiseCallback !== this) return
            stopAll()
            error("Broadcast failed (Android code $errorCode).")
          }
        }
      }
      advertiser = instance
      advertiseCallback = callback
      val data = AdvertiseData.Builder().setIncludeDeviceName(false).addServiceUuid(service).build()
      val settings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setConnectable(false)
        .setTimeout(60_000)
        .build()
      instance.startAdvertising(settings, data, callback)
      handler.postDelayed(timeout, 60_000)
      "requested"
    } catch (_: SecurityException) {
      stopAll()
      error("Bluetooth permission was denied or revoked.")
    } catch (_: Exception) {
      stopAll()
      error("Could not start Bluetooth broadcast.")
    }
  }

  @Synchronized
  @SuppressLint("MissingPermission")
  private fun startScan(): String {
    stopAll()
    if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
      (Build.VERSION.SDK_INT >= 31 &&
       (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT) ||
        !hasPermission(Manifest.permission.BLUETOOTH_SCAN)))) {
      return error("Bluetooth and location permissions are required for this scan test.")
    }
    return try {
      val manager = context().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        ?: return error("Bluetooth is unavailable on this phone.")
      val adapter = manager.adapter ?: return error("Bluetooth is unavailable on this phone.")
      if (!adapter.isEnabled) return error("Turn Bluetooth on and try again.")
      val instance = adapter.bluetoothLeScanner ?: return error("BLE scanner is unavailable.")
      val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          synchronized(this@OpenFindBleLabModule) {
            if (scanCallback !== this) return
            if (result.scanRecord?.serviceUuids?.contains(service) != true) return
            val now = SystemClock.elapsedRealtime()
            if (now - lastDetectionMs < 1000) return
            lastDetectionMs = now
            // Never emit device names, addresses, raw advertisements or location.
            sendEvent("onLabEvent", mapOf("kind" to "detected", "message" to "Test beacon detected nearby."))
          }
        }
        override fun onScanFailed(errorCode: Int) {
          synchronized(this@OpenFindBleLabModule) {
            if (scanCallback !== this) return
            stopAll()
            error("Scan failed (Android code $errorCode).")
          }
        }
      }
      scanner = instance
      scanCallback = callback
      lastDetectionMs = 0
      val filter = ScanFilter.Builder().setServiceUuid(service).build()
      val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
      instance.startScan(listOf(filter), settings, callback)
      handler.postDelayed(timeout, 60_000)
      sendEvent("onLabEvent", mapOf("kind" to "scanning", "message" to "Scanning for the test beacon."))
      "requested"
    } catch (_: SecurityException) {
      stopAll()
      error("Bluetooth or location permission was denied or revoked.")
    } catch (_: Exception) {
      stopAll()
      error("Could not start Bluetooth scan.")
    }
  }

  @Synchronized
  @SuppressLint("MissingPermission")
  private fun stopAll() {
    handler.removeCallbacks(timeout)
    val oldScanner = scanner
    val oldScanCallback = scanCallback
    val oldAdvertiser = advertiser
    val oldAdvertiseCallback = advertiseCallback
    scanner = null
    scanCallback = null
    advertiser = null
    advertiseCallback = null
    try {
      if (oldScanner != null && oldScanCallback != null) oldScanner.stopScan(oldScanCallback)
    } catch (_: Exception) { /* permission may have been revoked */ }
    try {
      if (oldAdvertiser != null && oldAdvertiseCallback != null) oldAdvertiser.stopAdvertising(oldAdvertiseCallback)
    } catch (_: Exception) { /* permission may have been revoked */ }
  }
}

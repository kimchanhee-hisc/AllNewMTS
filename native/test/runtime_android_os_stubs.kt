package android.os

class Looper private constructor() {
  companion object { @JvmStatic fun getMainLooper() = Looper() }
}

class Handler(@Suppress("UNUSED_PARAMETER") looper: Looper) {
  fun post(work: () -> Unit): Boolean { work(); return true }
}

include build/make/target/board/BoardConfigMainlineCommon.mk
include build/make/target/board/BoardConfigPixelCommon.mk

include vendor/adevtool/config/mk/google_devices/common/BoardConfig-armv9.mk

include vendor/adevtool/config/mk/google_devices/common/BoardConfig-common-gs201-plus.mk

SYSTEM_EXT_PUBLIC_SEPOLICY_DIRS += vendor/adevtool/config/mk/google_devices/platform/malibu/sepolicy/system_ext/public
SYSTEM_EXT_PRIVATE_SEPOLICY_DIRS += vendor/adevtool/config/mk/google_devices/platform/malibu/sepolicy/system_ext/private

$(call inherit-product, vendor/adevtool/config/mk/google_devices/platform/zumapro/product-common.mk)

TARGET_KERNEL_DIR ?= device/google/stallion-kernels/6.1/grapheneos

include vendor/adevtool/config/mk/google_devices/platform/zumapro/device.mk

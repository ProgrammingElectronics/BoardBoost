if ("serial" in navigator) {
  console.log("The Web Serial API is supported.");
}

document
  .getElementById("connect-serial")
  .addEventListener("click", async () => {
    // Prompt user to select any serial port.
    // const port = await navigator.serial.requestPort();

    // const filters = [
    //   // Arduino Uno
    //   { usbVendorId: 0x2341, usbProductId: 0x0043 },
    //   { usbVendorId: 0x2341, usbProductId: 0x0001 },

    //   // ESP32 (Silicon Labs CP210x)
    //   { usbVendorId: 0x10c4, usbProductId: 0xea60 },

    //   // ESP8266 NodeMCU (CH340)
    //   { usbVendorId: 0x1a86, usbProductId: 0x7523 },

    //   // ESP32 (FTDI)
    //   { usbVendorId: 0x0403, usbProductId: 0x6001 },

    //   // ESP32-WROOM (some variants)
    //   { usbVendorId: 0x303a, usbProductId: 0x1001 },
    // ];

    // Prompt user to select an Arduino Uno device.
    const port = await navigator.serial.requestPort();

    const { usbProductId, usbVendorId } = port.getInfo();
  });

// // Prompt user to select any serial port.
// const ports = await navigator.serial.getPorts();
// console.log("Available ports:", ports);

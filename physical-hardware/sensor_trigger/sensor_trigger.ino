/*
  Dream Map 2127 - Human Sensor Trigger
  M5Stack + PIR Human Sensor
*/

#include <M5Stack.h>
#include <USB.h>
#include <USBHIDKeyboard.h>

USBHIDKeyboard Keyboard;

const int SENSOR_PIN = 36;
bool isTriggered = false;
unsigned long lastTriggerTime = 0;
const unsigned long COOLDOWN_TIME = 10000;

void setup() {
  M5.begin();
  pinMode(SENSOR_PIN, INPUT);

  Keyboard.begin();
  USB.begin();

  M5.Lcd.clear(BLACK);
  M5.Lcd.setTextColor(GREEN);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setCursor(10, 10);
  M5.Lcd.println("DREAM SENSOR READY");
}

void loop() {
  M5.update();
  int sensorValue = digitalRead(SENSOR_PIN);
  unsigned long currentTime = millis();

  if (sensorValue == HIGH && !isTriggered && (currentTime - lastTriggerTime > COOLDOWN_TIME)) {
    isTriggered = true;
    lastTriggerTime = currentTime;

    Keyboard.press(' ');
    delay(100);
    Keyboard.releaseAll();

    M5.Lcd.clear(BLUE);
    M5.Lcd.setTextColor(WHITE);
    M5.Lcd.setCursor(10, 10);
    M5.Lcd.println("HUMAN DETECTED!");
    M5.Lcd.setCursor(10, 40);
    M5.Lcd.println("STARTING SCAN...");
  }

  if (isTriggered && (currentTime - lastTriggerTime > COOLDOWN_TIME)) {
    isTriggered = false;
    M5.Lcd.clear(BLACK);
    M5.Lcd.setTextColor(GREEN);
    M5.Lcd.setCursor(10, 10);
    M5.Lcd.println("DREAM SENSOR READY");
  }

  delay(100);
}
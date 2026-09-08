from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime, timezone
from database import Base

class SensorData(Base):
    __tablename__ = "sensor_data"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    node_id = Column(String, index=True, default="A2")
    node_name = Column(String, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    temperature = Column(Float, default=24.0)
    humidity = Column(Float, default=55.0)
    co_gas_level = Column(Float, default=300.0)
    distance_mm = Column(Float, default=2000.0)
    pitch = Column(Float, default=0.5)
    roll = Column(Float, default=0.4)
    vibration = Column(Float, default=0.05)
    roof_load_kg = Column(Float, default=0.8)
    risk_score = Column(Float, default=10.0)
    anomaly_flag = Column(String, default="NORMAL")
    lora_rssi = Column(Float, default=-88.0)
    lora_snr = Column(Float, default=7.5)
    battery_pct = Column(Float, default=85.0)
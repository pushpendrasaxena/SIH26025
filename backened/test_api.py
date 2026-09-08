"""
Test API Script: Send test data to the backend and verify functionality
"""
import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_post_sensor_data():
    """Test POST /api/sensor-data endpoint"""
    print("\n" + "="*70)
    print("  TEST 1: POST /api/sensor-data (Submit sensor readings)")
    print("="*70)
    
    # Test scenario 1: Normal conditions
    print("\n  Scenario 1: Normal Operating Conditions")
    normal_payload = {
        "node_id": "A2",
        "temperature": 5.5,
        "humidity": 0.0,
        "co_gas_level": 30.0,
        "distance_mm": 00.0,
        "pitch": 0.3,
        "roll": 0.2,
        "vibration": 0.02,
        "roof_load_kg": .2,
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/sensor-data", json=normal_payload, timeout=5)
        if response.status_code == 200:
            result = response.json()
            print(f"    ✓ Status: {result.get('status')}")
            print(f"    ✓ Risk Score: {result.get('calculated_risk_score')}%")
            print(f"    ✓ Flag: {result.get('evaluated_flag')}")
        else:
            print(f"    ❌ Status Code: {response.status_code}")
    except Exception as e:
        print(f"    ❌ Error: {e}")
    
    # Test scenario 2: Warning conditions
    print("\n  Scenario 2: Warning Conditions (Elevated Temperature + Gas)")
    warning_payload = {
        "node_id": "A3",
        "temperature": 35.5,
        "humidity": 7.0,
        "co_gas_level": 10.0,
        "distance_mm": 0.0,
        "pitch": .5,
        "roll": .8,
        "vibration": 0.15,
        "roof_load_kg": .5,
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/sensor-data", json=warning_payload, timeout=5)
        if response.status_code == 200:
            result = response.json()
            print(f"    ✓ Status: {result.get('status')}")
            print(f"    ✓ Risk Score: {result.get('calculated_risk_score')}%")
            print(f"    ✓ Flag: {result.get('evaluated_flag')}")
        else:
            print(f"    ❌ Status Code: {response.status_code}")
    except Exception as e:
        print(f"    ❌ Error: {e}")
    
    # Test scenario 3: Critical conditions
    print("\n  Scenario 3: Critical Conditions (Extreme Heat + CO Gas)")
    critical_payload = {
        "node_id": "B1",
        "temperature": 3.5,
        "humidity": 5.0,
        "co_gas_level": 10.0,
        "distance_mm": 0.0,
        "pitch": .0,
        "roll": .5,
        "vibration": 0.45,
        "roof_load_kg": .8,
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/sensor-data", json=critical_payload, timeout=5)
        if response.status_code == 200:
            result = response.json()
            print(f"    ✓ Status: {result.get('status')}")
            print(f"    ✓ Risk Score: {result.get('calculated_risk_score')}%")
            print(f"    ✓ Flag: {result.get('evaluated_flag')}")
        else:
            print(f"    ❌ Status Code: {response.status_code}")
    except Exception as e:
        print(f"    ❌ Error: {e}")

def test_get_nodes_latest():
    """Test GET /api/nodes/latest endpoint"""
    print("\n" + "="*70)
    print("  TEST 2: GET /api/nodes/latest (Fetch all nodes)")
    print("="*70)
    
    try:
        response = requests.get(f"{BASE_URL}/api/nodes/latest", timeout=5)
        if response.status_code == 200:
            nodes = response.json()
            print(f"\n  ✓ Retrieved data for {len(nodes)} nodes:")
            for node in nodes:
                print(f"\n    Node {node.get('node_id')}:")
                print(f"      Risk Score: {node.get('risk_score')}%")
                print(f"      Status:     {node.get('anomaly_flag')}")
                print(f"      Temp:       {node.get('temperature')}°C")
                print(f"      CO:         {node.get('co_gas_level')} ppm")
        else:
            print(f"    ❌ Status Code: {response.status_code}")
    except Exception as e:
        print(f"    ❌ Error: {e}")

if __name__ == "__main__":
    print("\n" + "🧪 MINE SAFETY API TEST SUITE".center(70))
    print("="*70)
    
    try:
        # Test POST endpoint
        test_post_sensor_data()
        
        # Wait a moment for database to update
        time.sleep(1)
        
        # Test GET endpoint
        test_get_nodes_latest()
        
        print("\n" + "="*70)
        print("✓ All tests completed!")
        print("="*70 + "\n")
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to FastAPI server.")
        print("   Make sure the backend is running: python main.py")
        print()

### Simulation Course

#### Overview

This is the repo containing the answers to the exercises in the Simulation Course for IPMKN 6th semester, TSU. Each `labN` folder contains the answers to the exercises in that lab.

#### Usage:

To use this repository, follow these steps:

1. Clone the repository to your local machine.
   ```
   git clone https://github.com/FakeCoder01/simulation-course.git
   ```
2. Navigate to the folder.
   ```
   cd simulation-course
   ```
3. Run all labs simultaneously using docker or podman.
   ```
   docker-compose up --build
   ```

- To run a specific lab, navigate to the lab folder and run the following command:
  ```
  cd labN
  docker-compose up --build
  ```

4. Open browser and visit `http://localhost:3000/labN`

---

#### Labs:

1. **Lab 1: Моделирование полёта тела в атмосфере ( [Code](lab01) | [Live](https://sim.ipmkn.ru/lab1/))**

### Метод конечных разностей для уравнения теплопроводности

**Задание:**
Реализовать моделирование изменения температуры в пластине на основе одномерного уравнения теплопроводности с использованием метода конечных разностей.

Выполнить моделирование с различными шагами по времени и по пространству.
Заполнить таблицу значений температуры в центральной точке пластины после 2 секунд модельного времени.

| Шаг по времени, с \ Шаг по пространству, м | 0.1 | 0.01 | 0.001 | 0.0001 |
| ------------------------------------------ | --- | ---- | ----- | ------ |
| 0.1                                        |     |      |       |        |
| 0.01                                       |     |      |       |        |
| 0.001                                      |     |      |       |        |
| 0.0001                                     |     |      |       |        |

**Сделать вывод.**

---

## ОТЧЕТ

### код

```go
func simulate(p SimParams) SimResult {
	nx := int(math.Round(p.L/p.Dx)) + 1
	if nx < 3 {
		nx = 3
	}
	steps := int(math.Round(p.TFinal / p.Dt))
	if steps < 1 {
		steps = 1
	}

	// 'r' is calculated just for reporting; implicit method is unconditionally stable
	r := p.Alpha * p.Dt / (p.Dx * p.Dx)
	stable := true

	ops := int64(nx) * int64(steps)
	if ops > MaxOps {
		return SimResult{
			Temperature: nil,
			Stable:      stable,
			CFL:         r,
			NX:          nx,
			Steps:       steps,
			Alpha:       p.Alpha,
			L:           p.L,
			TFinal:      p.TFinal,
			ICPeak:      p.ICPeak,
			Dt:          p.Dt,
			Dx:          p.Dx,
			Message:     fmt.Sprintf("Too costly: %d ops exceeds limit %d. Refine Δt or Δx.", ops, MaxOps),
		}
	}


	// T[i] maps to temperatures at x = i*dx
	T := make([]float64, nx)

	// set initial condition: Uniform T0 across the plate
	for i := 0; i < nx; i++ {
		T[i] = p.ICPeak
	}

	// boundary conditions (fixed to 0.0, representing Ta and Tn)
	TLeft := 0.0
	TRight := 0.0
	T[0] = TLeft
	T[nx-1] = TRight

	// sweep coefficients arrays
	alphaArr := make([]float64, nx)
	betaArr := make([]float64, nx)

	// precompute static constants
	// based on: Ai = Ci = lambda/h^2; Bi = 2*lambda/h^2 + rho*c/tau
	// we substitute lambda/(rho*c) = p.Alpha
	A := p.Alpha / (p.Dx * p.Dx)
	C := A
	B := 2.0*A + 1.0/p.Dt

	diverged := false
	divergeStep := 0

	// time stepping loop
	for t := 0; t < steps; t++ {
		// forward sweep : Прямая прогонка
		alphaArr[0] = 0.0
		betaArr[0] = TLeft

		for i := 1; i < nx-1; i++ {
			// F_i = -(rho*c/tau) * T_i^n
			F := -(1.0 / p.Dt) * T[i]

			denom := B - C*alphaArr[i-1]
			alphaArr[i] = A / denom
			betaArr[i] = (C*betaArr[i-1] - F) / denom
		}

		// backward sweep : Обратная прогонка
		T[nx-1] = TRight
		for i := nx - 2; i >= 1; i-- {
			T[i] = alphaArr[i]*T[i+1] + betaArr[i]
		}
		T[0] = TLeft

		// check divergence at center just in case of extreme parameter float overflow
		mid := T[nx/2]
		if math.IsNaN(mid) || math.IsInf(mid, 0) || math.Abs(mid) > 1e15 {
			diverged = true
			divergeStep = t
			stable = false
			break
		}
	}

	if diverged {
		return SimResult{
			Temperature: nil,
			Stable:      false,
			CFL:         r,
			NX:          nx,
			Steps:       steps,
			Alpha:       p.Alpha,
			L:           p.L,
			TFinal:      p.TFinal,
			ICPeak:      p.ICPeak,
			Dt:          p.Dt,
			Dx:          p.Dx,
			Message:     fmt.Sprintf("Diverged at step %d due to numerical overflow", divergeStep),
		}
	}

	// build sampled profile (max 300 points for the graph)
	sampleCount := nx
	if sampleCount > 300 {
		sampleCount = 300
	}
	xVals := make([]float64, sampleCount)
	uVals := make([]float64, sampleCount)
	for i := 0; i < sampleCount; i++ {
		gi := int(math.Round(float64(i) * float64(nx-1) / float64(sampleCount-1)))
		if gi >= nx {
			gi = nx - 1
		}
		xVals[i] = float64(gi) * p.Dx
		uVals[i] = T[gi]
	}

	centerIdx := nx / 2
	temp := T[centerIdx]

	return SimResult{
		Temperature: &temp,
		Profile:     uVals,
		XValues:     xVals,
		Stable:      stable,
		CFL:         r,
		NX:          nx,
		Steps:       steps,
		Alpha:       p.Alpha,
		L:           p.L,
		TFinal:      p.TFinal,
		ICPeak:      p.ICPeak,
		Dt:          p.Dt,
		Dx:          p.Dx,
		Message:     "Implicit Method - Unconditionally Stable",
	}
}
```

### таблицу

| Шаг по времени, с \ Шаг по пространству, м | 0.1     | 0.01     | 0.001    | 0.0001              |
| ------------------------------------------ | ------- | -------- | -------- | ------------------- |
| 0.1                                        | 99.9994 | Diverged | Diverged | Diverged            |
| 0.01                                       | 99.9996 | 100      | Diverged | Diver d             |
| 0.001                                      | 99.9996 | 100      | Diverged | Diverged            |
| 0.0001                                     | 99.9996 | 100      | 100      | Too costly/Overflow |

---

### скриншот:

![Screenshot](./result-graph.png)
![Screenshot](./result-table.png)

### Вывод:

Результаты моделирования показывают, что явный метод конечных разностей является лишь условно устойчивым.

- **Стабильность против дискретизации:** По мере уменьшения шага по пространству ($Δx$) шаг по времени ($Δt$) должен уменьшаться квадратично ($Δt \leq \frac{Δx^2}{2α}$), чтобы предотвратить численные колебания.

- **Расхождение:** Записи, помеченные как "Расхождение", представляют собой комбинации, в которых решатель стал нестабильным из-за слишком большого шага по времени относительно пространственной сетки.

- **Вычислительный предел:** «Переполнение» на самых малых шагах подчеркивает чрезвычайно высокую вычислительную стоимость поддержания стабильности в высокоточных моделях.

Полученные данные подтверждают, что поиск оптимального баланса между $Δt$ и $Δx$ имеет решающее значение для достижения стабильного, физически обоснованного решения (приблизительно 100,0) без достижения вычислительных ограничений.

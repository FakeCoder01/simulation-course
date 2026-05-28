let format_float value =
  Printf.sprintf "%.6f" value

let json_of_float_list values =
  values |> List.map format_float |> String.concat ","

let error_response ?rho message =
  let rho_value =
    match rho with
    | None -> "null"
    | Some v -> format_float v
  in
  let body =
    Printf.sprintf
      {|{"error":%S,"stable":false,"rho":%s}|}
      message
      rho_value
  in
  Dream.json ~status:`Bad_Request body

let parse_float req name =
  match Dream.query req name with
  | None -> Error (Printf.sprintf "Missing '%s' parameter." name)
  | Some value ->
      (try Ok (float_of_string value) with Failure _ ->
       Error (Printf.sprintf "Invalid '%s' value." name))

let parse_int req name default_value =
  match Dream.query req name with
  | None -> Ok default_value
  | Some value ->
      (try Ok (int_of_string value) with Failure _ ->
       Error (Printf.sprintf "Invalid '%s' value." name))

let parse_int_opt req name =
  match Dream.query req name with
  | None -> Ok None
  | Some value ->
      (try Ok (Some (int_of_string value)) with Failure _ ->
       Error (Printf.sprintf "Invalid '%s' value." name))

let exp_rand rand rate =
  let u = Random.State.float rand 1.0 in
  -. (log (1. -. u)) /. rate

type sim_result =
  { customers : int
  ; warmup : int
  ; rho : float
  ; l : float
  ; lq : float
  ; w : float
  ; wq : float
  ; p0 : float
  ; pn : float list
  }

let simulate_mm1 ~lambda ~mu ~n ~customers ~warmup ~seed =
  let total = customers + warmup in
  let rand =
    match seed with
    | Some s -> Random.State.make [| s |]
    | None -> Random.State.make_self_init ()
  in
  let arrivals = Array.make total 0.0 in
  let services = Array.make total 0.0 in
  for i = 0 to total - 1 do
    let inter = exp_rand rand lambda in
    arrivals.(i) <- if i = 0 then inter else arrivals.(i - 1) +. inter;
    services.(i) <- exp_rand rand mu
  done;

  let starts = Array.make total 0.0 in
  let departures = Array.make total 0.0 in
  for i = 0 to total - 1 do
    let start_time =
      if i = 0 then arrivals.(i) else max arrivals.(i) departures.(i - 1)
    in
    starts.(i) <- start_time;
    departures.(i) <- start_time +. services.(i)
  done;

  let t0 = if warmup = 0 then 0.0 else departures.(warmup - 1) in
  let sum_w = ref 0.0 in
  let sum_wq = ref 0.0 in
  for i = warmup to total - 1 do
    sum_w := !sum_w +. (departures.(i) -. arrivals.(i));
    sum_wq := !sum_wq +. (starts.(i) -. arrivals.(i))
  done;
  let count = float_of_int customers in
  let w = !sum_w /. count in
  let wq = !sum_wq /. count in

  let events = Array.make (2 * total) (0.0, 0) in
  for i = 0 to total - 1 do
    events.(2 * i) <- (arrivals.(i), 1);
    events.(2 * i + 1) <- (departures.(i), -1)
  done;
  Array.sort
    (fun (t1, d1) (t2, d2) ->
      let c = compare t1 t2 in
      if c <> 0 then c else compare d1 d2)
    events;

  let time_in_state = Array.make (n + 1) 0.0 in
  let area_system = ref 0.0 in
  let area_queue = ref 0.0 in
  let idle_time = ref 0.0 in
  let n_system = ref 0 in
  let last_time = ref 0.0 in
  let started = ref false in

  let accumulate dt =
    if dt > 0.0 then (
      let n_sys = !n_system in
      let n_queue = if n_sys > 0 then n_sys - 1 else 0 in
      area_system := !area_system +. (float_of_int n_sys *. dt);
      area_queue := !area_queue +. (float_of_int n_queue *. dt);
      if n_sys = 0 then idle_time := !idle_time +. dt;
      if n_sys <= n then time_in_state.(n_sys) <- time_in_state.(n_sys) +. dt)
  in

  Array.iter
    (fun (t, delta) ->
      if not !started then
        if t < t0 then (
          n_system := !n_system + delta;
          last_time := t)
        else (
          started := true;
          last_time := t0;
          let dt = t -. !last_time in
          accumulate dt;
          n_system := !n_system + delta;
          last_time := t)
      else (
        let dt = t -. !last_time in
        accumulate dt;
        n_system := !n_system + delta;
        last_time := t))
    events;

  let t_end = departures.(total - 1) in
  let window = t_end -. t0 in
  let l = if window > 0.0 then !area_system /. window else lambda *. w in
  let lq = if window > 0.0 then !area_queue /. window else lambda *. wq in
  let p0 =
    if window > 0.0 then !idle_time /. window else 1. -. (lambda /. mu)
  in
  let rho = 1. -. p0 in
  let pn =
    if window > 0.0 then
      Array.to_list (Array.map (fun time -> time /. window) time_in_state)
    else
      List.init (n + 1) (fun _ -> 0.0)
  in
  { customers; warmup; rho; l; lq; w; wq; p0; pn }

let mm1_handler req =
  match parse_float req "lambda", parse_float req "mu" with
  | Ok lambda, Ok mu -> begin
      if lambda <= 0. || mu <= 0. then
        error_response "Rates must be positive (λ > 0, μ > 0)."
      else
        let rho = lambda /. mu in
        if rho >= 1. then
          error_response ~rho "System is unstable (λ ≥ μ). Choose λ < μ."
        else
          match parse_int req "n" 12 with
          | Error msg -> error_response msg
          | Ok n when n < 1 || n > 200 ->
              error_response "n must be between 1 and 200."
          | Ok n ->
              let customers_default = 8000 in
              let warmup_default = 1000 in
              let customers_min = 500 in
              let customers_max = 20000 in
              let warmup_max = 5000 in
              (match
                 ( parse_int req "customers" customers_default,
                   parse_int req "warmup" warmup_default,
                   parse_int_opt req "seed" )
               with
              | Error msg, _, _
              | _, Error msg, _
              | _, _, Error msg ->
                  error_response msg
              | Ok customers, Ok warmup, Ok seed ->
                  if customers < customers_min || customers > customers_max then
                    error_response
                      (Printf.sprintf
                         "customers must be between %d and %d."
                         customers_min
                         customers_max)
                  else if warmup < 0 || warmup > warmup_max then
                    error_response
                      (Printf.sprintf
                         "warmup must be between 0 and %d."
                         warmup_max)
                  else
                    let one_minus = 1. -. rho in
                    let l = rho /. one_minus in
                    let lq = (rho *. rho) /. one_minus in
                    let w = 1. /. (mu -. lambda) in
                    let wq = rho /. (mu -. lambda) in
                    let p0 = one_minus in
                    let pn =
                      List.init (n + 1) (fun k -> p0 *. (rho ** float_of_int k))
                    in
                    let sim =
                      simulate_mm1
                        ~lambda
                        ~mu
                        ~n
                        ~customers
                        ~warmup
                        ~seed
                    in
                    let pn_str = json_of_float_list pn in
                    let sim_pn_str = json_of_float_list sim.pn in
                    let seed_str =
                      match seed with
                      | None -> "null"
                      | Some value -> string_of_int value
                    in
                    let body =
                      Printf.sprintf
                        {|{"lambda":%s,"mu":%s,"rho":%s,"L":%s,"Lq":%s,"W":%s,"Wq":%s,"P0":%s,"n":%d,"Pn":[%s],"simulation":{"customers":%d,"warmup":%d,"seed":%s,"rho":%s,"L":%s,"Lq":%s,"W":%s,"Wq":%s,"P0":%s,"Pn":[%s]}}|}
                        (format_float lambda)
                        (format_float mu)
                        (format_float rho)
                        (format_float l)
                        (format_float lq)
                        (format_float w)
                        (format_float wq)
                        (format_float p0)
                        n
                        pn_str
                        sim.customers
                        sim.warmup
                        seed_str
                        (format_float sim.rho)
                        (format_float sim.l)
                        (format_float sim.lq)
                        (format_float sim.w)
                        (format_float sim.wq)
                        (format_float sim.p0)
                        sim_pn_str
                    in
                    Dream.json body)
    end
  | Error msg, _
  | _, Error msg ->
      error_response msg

let serve_index _req =
  try
    let ch = open_in_bin "static/index.html" in
    let len = in_channel_length ch in
    let content = really_input_string ch len in
    close_in ch;
    Dream.html content
  with Sys_error _ ->
    Dream.respond ~status:`Not_Found "Index file not found."

let () =
  Dream.run ~interface:"0.0.0.0" ~port:8080
  @@ Dream.logger
  @@ Dream.router
       [ Dream.get "/api/mm1" mm1_handler;
         Dream.get "/" serve_index;
         Dream.get "/**" (Dream.static "static")
       ]

open Lwt.Infix
open Yojson.Safe
open Yojson.Safe.Util


let respond_json ?(status = `OK) json =
  Dream.json ~status (Yojson.Safe.to_string json)

let required_float name json =
  match json |> member name with
  | `Float f -> f
  | `Int i -> float_of_int i
  | _ -> failwith (name ^ " must be a number")

let required_int name json =
  match json |> member name with
  | `Int i -> i
  | `Float f -> int_of_float f
  | _ -> failwith (name ^ " must be an integer")

let simulate_interval ~lambda ~interval =
  let rec loop t count =
    let u = 1.0 -. Random.float 1.0 in
    let t' = t +. ((-.log u) /. lambda) in
    if t' <= interval then loop t' (count + 1) else count
  in
  loop 0.0 0

let simulate ~lambda ~interval ~samples =
  let counts = Hashtbl.create 64 in
  let max_k = ref 0 in
  let sum = ref 0.0 in
  let sum_sq = ref 0.0 in
  let sample_example = ref 0 in

  for i = 1 to samples do
    let k = simulate_interval ~lambda ~interval in
    if i = 1 then sample_example := k;
    if k > !max_k then max_k := k;
    sum := !sum +. float_of_int k;
    sum_sq := !sum_sq +. float_of_int (k * k);
    let prev = match Hashtbl.find_opt counts k with Some v -> v | None -> 0 in
    Hashtbl.replace counts k (prev + 1)
  done;

  let max_k = !max_k in
  let counts_arr =
    Array.init (max_k + 1) (fun k ->
        match Hashtbl.find_opt counts k with Some v -> v | None -> 0)
  in
  let empirical =
    Array.map (fun c -> float_of_int c /. float_of_int samples) counts_arr
  in

  let mu = lambda *. interval in
  let theoretical = Array.make (max_k + 1) 0.0 in
  if max_k >= 0 then (
    theoretical.(0) <- exp (-.mu);
    for k = 1 to max_k do
      theoretical.(k) <- theoretical.(k - 1) *. mu /. float_of_int k
    done
  );

  let mean = !sum /. float_of_int samples in
  let variance = (!sum_sq /. float_of_int samples) -. (mean *. mean) in
  (counts_arr, empirical, theoretical, mean, variance, mu, max_k, !sample_example)

let simulate_handler req =
  Lwt.catch
    (fun () ->
      Dream.body req >>= fun body ->
      let json = Yojson.Safe.from_string body in
      let lambda = required_float "lambda" json in
      let interval = required_float "interval" json in
      let samples = required_int "samples" json in

      if lambda <= 0.0 then failwith "lambda must be > 0";
      if interval <= 0.0 then failwith "interval must be > 0";
      if samples <= 0 then failwith "samples must be > 0";

      let counts_arr, empirical, theoretical, mean, variance, mu, max_k,
          sample_example =
        simulate ~lambda ~interval ~samples
      in

      let int_list arr = Array.to_list arr |> List.map (fun v -> `Int v) in
      let float_list arr = Array.to_list arr |> List.map (fun v -> `Float v) in

      respond_json
        (`Assoc
          [
            ("lambda", `Float lambda);
            ("interval", `Float interval);
            ("samples", `Int samples);
            ("mu", `Float mu);
            ("mean", `Float mean);
            ("variance", `Float variance);
            ("theoreticalMean", `Float mu);
            ("theoreticalVariance", `Float mu);
            ("maxK", `Int max_k);
            ("sampleExample", `Int sample_example);
            ("counts", `List (int_list counts_arr));
            ("empirical", `List (float_list empirical));
            ("theoretical", `List (float_list theoretical));
          ])
    )
    (function
      | Failure msg ->
          respond_json ~status:`Bad_Request (`Assoc [ ("error", `String msg) ])
      | Yojson.Json_error msg ->
          respond_json ~status:`Bad_Request (`Assoc [ ("error", `String msg) ])
      | exn ->
          respond_json ~status:`Internal_Server_Error
            (`Assoc [ ("error", `String (Printexc.to_string exn)) ])
    )

let health_handler _req =
  respond_json (`Assoc [ ("status", `String "ok") ])

let () =
  Random.self_init ();
  Dream.run ~interface:"0.0.0.0" ~port:8080
  @@ Dream.router
       [
         Dream.get "/api/health" health_handler;
         Dream.post "/api/simulate" simulate_handler;
       ]

package com.flighttracking.controller;

import com.flighttracking.dto.MessageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/atc")
public class AtcController {

    @GetMapping("/test")
    public ResponseEntity<MessageResponse> atcAccess() {
        return ResponseEntity.ok(new MessageResponse("ATC employee access successful"));
    }
}

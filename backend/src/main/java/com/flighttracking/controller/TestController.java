package com.flighttracking.controller;

import com.flighttracking.dto.MessageResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/test")
public class TestController {

    @GetMapping("/user")
    public ResponseEntity<MessageResponse> userAccess() {
        return ResponseEntity.ok(new MessageResponse("Authenticated user access successful"));
    }
}

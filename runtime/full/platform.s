// Platform support for the complete T0 engine. See ABI.md.
uart_putc:
    mov x1, #0x09000000
full_uart_tx:
    ldr w2, [x1, #24]
    tbnz x2, #5, full_uart_tx
    str w0, [x1]
    ret
uart_getc:
    mov x1, #0x09000000
full_uart_rx:
    ldr w2, [x1, #24]
    tbnz x2, #4, full_uart_rx
    ldr w0, [x1]
    and x0, x0, #255
    ret
puts:
    stp x19, x30, [sp, #-16]!
    mov x19, x0
full_puts_loop:
    ldrb w0, [x19]
    cbz w0, full_puts_done
    bl uart_putc
    add x19, x19, #1
    b full_puts_loop
full_puts_done:
    ldp x19, x30, [sp], #16
    ret
newline:
    stp x29, x30, [sp, #-16]!
    mov x0, #13
    bl uart_putc
    mov x0, #10
    bl uart_putc
    ldp x29, x30, [sp], #16
    ret
heap_alloc:
    adds x1, x0, #7
    b.cs fatal_heap
    and x1, x1, #0xfffffffffffffff8
    adds x2, x24, x1
    b.cs fatal_heap
    mov x3, #0x5f000000
    cmp x2, x3
    b.hi fatal_heap
    mov x0, x24
    mov x24, x2
    ret
arena_alloc:
    adds x1, x0, #7
    b.cs fatal_arena
    and x1, x1, #0xfffffffffffffff8
    adds x2, x23, x1
    b.cs fatal_arena
    mov x3, #0x47000000
    cmp x2, x3
    b.hi fatal_arena
    mov x0, x23
    mov x23, x2
    ret
value_push:
    mov x1, #0x40880000
    cmp x22, x1
    b.hs fatal_stack
    str x0, [x22]
    add x22, x22, #8
    ret
value_pop:
    mov x1, #0x40800000
    cmp x22, x1
    b.ls full_pop_empty
    sub x22, x22, #8
    ldr x0, [x22]
    ret
full_pop_empty:
    mov x0, #10
    ret
native_guard:
    mov x0, sp
    mov x1, #0x40a00000
    cmp x0, x1
    b.lo fatal_native
    ret
read_line:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    mov x19, x0
    sub x20, x1, #1
    mov x21, #0
    mov x25, #0
full_read_next:
    bl uart_getc
    adr x3, full_skip_lf
    ldr x4, [x3]
    cbz x4, full_read_dispatch
    str xzr, [x3]
    cmp x0, #10
    b.eq full_read_next
full_read_dispatch:
    cmp x0, #13
    b.eq full_read_cr
    cmp x0, #10
    b.eq full_read_end
    cbnz x25, full_read_drain
    cmp x0, #8
    b.eq full_read_bs
    cmp x0, #127
    b.eq full_read_bs
    cmp x0, #32
    b.hs full_read_char
    cmp x0, #9
    b.ne full_read_next
full_read_char:
    cmp x21, x20
    b.hs full_read_full
    strb w0, [x19, x21]
    add x21, x21, #1
    bl uart_putc
    b full_read_next
full_read_full:
    mov x25, #1
full_read_drain:
    bl uart_putc
    b full_read_next
full_read_bs:
    cbz x21, full_read_next
    sub x21, x21, #1
full_read_bs_utf8:
    cbz x21, full_read_bs_echo
    ldrb w0, [x19, x21]
    and x0, x0, #192
    cmp x0, #128
    b.ne full_read_bs_echo
    sub x21, x21, #1
    b full_read_bs_utf8
full_read_bs_echo:
    mov x0, #8
    bl uart_putc
    mov x0, #32
    bl uart_putc
    mov x0, #8
    bl uart_putc
    b full_read_next
full_read_cr:
    adr x3, full_skip_lf
    mov x4, #1
    str x4, [x3]
full_read_end:
    strb wzr, [x19, x21]
    bl newline
    mov x0, x21
    mov x1, x25
    ldp x21, x25, [sp, #16]
    ldp x29, x30, [sp, #32]
    ldp x19, x20, [sp], #48
    ret
// Multiline collection happens in the guest. The source is evaluated once,
// preserving line breaks for comments, strings, input_ and captured positions.
// :paste / :end are terminal directives, not T0 compiler words.
read_source:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x29, x30, [sp, #48]
    adr x19, full_input_buffer
    mov x0, x19
    mov x1, #65536
    bl read_line
    mov x20, x0
    mov x21, x1
    cbnz x21, full_source_done
    mov x0, x19
    adr x1, full_paste_begin
    bl full_ascii_equal
    cbz x0, full_source_done
    mov x20, #0
full_source_more:
    adr x0, full_paste_prompt
    bl puts
    mov x27, #0
    cbnz x21, full_source_discard
    add x25, x19, x20
    mov x1, #65536
    sub x1, x1, x20
    // Even a full source buffer must still be able to read :end/:cancel.
    cmp x1, #8
    b.lo full_source_discard
    b full_source_read
full_source_discard:
    mov x27, #1
    adr x25, full_discard_buffer
    mov x1, #256
full_source_read:
    mov x0, x25
    bl read_line
    mov x26, x0
    orr x21, x21, x1
    mov x0, x25
    adr x1, full_paste_end
    bl full_ascii_equal
    cbnz x0, full_source_end
    mov x0, x25
    adr x1, full_paste_cancel
    bl full_ascii_equal
    cbnz x0, full_source_cancel
    cbnz x21, full_source_more
    add x4, x20, x26
    mov x0, #65535
    cmp x4, x0
    b.hs full_source_full
    cbz x27, full_source_append_newline
    add x0, x19, x20
full_source_copy_tail:
    cbz x26, full_source_append_newline
    ldrb w1, [x25]
    strb w1, [x0]
    add x25, x25, #1
    add x0, x0, #1
    sub x26, x26, #1
    b full_source_copy_tail
full_source_append_newline:
    mov x20, x4
    mov x0, #10
    strb w0, [x19, x20]
    add x20, x20, #1
    b full_source_more
full_source_full:
    mov x21, #1
    b full_source_more
full_source_cancel:
    mov x20, #0
    mov x21, #0
full_source_end:
    strb wzr, [x19, x20]
full_source_done:
    mov x0, x20
    mov x1, x21
    ldp x29, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret
full_ascii_equal:
    ldrb w2, [x0]
    ldrb w3, [x1]
    cmp x2, x3
    b.ne full_ascii_different
    cbz x2, full_ascii_same
    add x0, x0, #1
    add x1, x1, #1
    b full_ascii_equal
full_ascii_different:
    mov x0, #0
    ret
full_ascii_same:
    mov x0, #1
    ret
fatal_heap:
    adr x0, full_heap_message
    b fatal_halt
fatal_arena:
    adr x0, full_arena_message
    b fatal_halt
fatal_stack:
    adr x0, full_stack_message
    b fatal_halt
fatal_native:
    adr x0, full_native_message
fatal_halt:
    bl puts
    bl newline
full_halt_loop:
    wfi
    b full_halt_loop
runtime_error:
    stp x0, xzr, [sp, #-16]!
    adr x0, full_error_prefix
    bl puts
    ldp x0, xzr, [sp], #16
    bl puts
    bl newline
    b full_repl_recover
.align 3
full_skip_lf:
    .quad 0
full_error_prefix:
    .asciz "Error: "
full_heap_message:
    .asciz "HALTED: value heap exhausted (no garbage collection). Reboot the guest."
full_arena_message:
    .asciz "HALTED: compiler/frame arena exhausted (no garbage collection). Reboot the guest."
full_stack_message:
    .asciz "HALTED: data stack exhausted. Reboot the guest."
full_native_message:
    .asciz "HALTED: native call stack exhausted. Reboot the guest."
full_paste_begin:
    .asciz ":paste"
full_paste_end:
    .asciz ":end"
full_paste_cancel:
    .asciz ":cancel"
full_paste_prompt:
    .asciz "... "
.align 3
full_discard_buffer:
    .space 256

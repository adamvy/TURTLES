// Raw-word primitives. The caller selects integer, string, array or block operations.
prim_binary:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    stp x0, xzr, [sp, #-16]!
    bl value_pop
    ldp x1, xzr, [sp], #16
    ldp x29, x30, [sp], #16
    ret
prim_add:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    add x0, x0, x1
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_sub:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    sub x0, x0, x1
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_mul:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    mul x0, x0, x1
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_div:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cbz x1, full_division_zero
    sdiv x0, x0, x1
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_mod:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cbz x1, full_division_zero
    sdiv x2, x0, x1
    msub x0, x2, x1, x0
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_pow:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cmp x1, #0
    b.lt full_negative_exponent
    mov x2, #1
full_pow_loop:
    cbz x1, full_pow_done
    tbz x1, #0, full_pow_square
    mul x2, x2, x0
full_pow_square:
    mul x0, x0, x0
    lsr x1, x1, #1
    b full_pow_loop
full_pow_done:
    mov x0, x2
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_percent:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    mov x1, #100
    sdiv x0, x0, x1
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cmp x0, x1
    cset x0, eq
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_not_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cmp x0, x1
    cset x0, ne
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_less:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cmp x0, x1
    cset x0, lt
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_less_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cmp x0, x1
    cset x0, le
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_greater:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cmp x0, x1
    cset x0, gt
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_greater_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    cmp x0, x1
    cset x0, ge
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_boolean:
    b value_push
prim_not:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl value_truthy
    cmp x0, #0
    cset x0, eq
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
prim_and:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x0, x1, [sp, #-16]!
    bl value_truthy
    ldp x1, x2, [sp], #16
    cmp x0, #0
    csel x0, x1, x2, eq
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_or:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x0, x1, [sp, #-16]!
    bl value_truthy
    ldp x1, x2, [sp], #16
    cmp x0, #0
    csel x0, x2, x1, eq
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_lazy_and:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x1, xzr, [sp, #-16]!
    bl value_truthy
    ldp x1, xzr, [sp], #16
    cbz x0, full_lazy_false
    mov x0, x1
    bl runtime_call
    b full_lazy_done
full_lazy_false:
    mov x0, #0
    bl value_push
full_lazy_done:
    ldp x29, x30, [sp], #16
    ret
prim_lazy_or:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x1, xzr, [sp, #-16]!
    bl value_truthy
    ldp x1, xzr, [sp], #16
    cbnz x0, full_lazy_true
    mov x0, x1
    bl runtime_call
    b full_lazy_done
full_lazy_true:
    mov x0, #1
    bl value_push
    b full_lazy_done
prim_if:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x1, xzr, [sp, #-16]!
    bl value_truthy
    ldp x1, xzr, [sp], #16
    cbz x0, full_if_done
    mov x0, x1
    bl runtime_call
full_if_done:
    ldp x29, x30, [sp], #16
    ret
prim_ifelse:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x0, x1, [sp, #-16]!
    bl value_pop
    bl value_truthy
    ldp x1, x2, [sp], #16
    cmp x0, #0
    csel x0, x2, x1, eq
    bl runtime_call
    ldp x29, x30, [sp], #16
    ret
prim_while:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    bl prim_binary
    mov x19, x0
    mov x20, x1
full_while_test:
    mov x0, x19
    bl runtime_call
    adr x1, throw_pending
    ldr x1, [x1]
    cbnz x1, full_while_done
    bl value_pop
    bl value_truthy
    cbz x0, full_while_done
    mov x0, x20
    bl runtime_call
    adr x1, throw_pending
    ldr x1, [x1]
    cbz x1, full_while_test
full_while_done:
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
prim_call:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl runtime_call
    ldp x29, x30, [sp], #16
    ret
prim_eval:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl t0_eval
    ldp x29, x30, [sp], #16
    ret
prim_print:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl print_value
    bl newline
    ldp x29, x30, [sp], #16
    ret
prim_string_print:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl print_string
    bl newline
    ldp x29, x30, [sp], #16
    ret
prim_debugger:
    ret
prim_const:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    mov x3, x0
    mov x0, x1
    mov x1, x3
    mov x2, #0
    bl core_define
    ldp x29, x30, [sp], #16
    ret
prim_semicolon:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    mov x2, #0
    bl core_define
    ldp x29, x30, [sp], #16
    ret
prim_parse_int:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl word_parse
    cbz x1, full_invalid_integer
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_to_string:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl word_format
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_pick:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    mov x1, #0x40800000
    sub x1, x22, x1
    lsr x1, x1, #3
    cmp x0, x1
    b.hs full_pick_missing
    sub x1, x22, #8
    lsl x0, x0, #3
    sub x1, x1, x0
    ldr x0, [x1]
    b full_pick_push
full_pick_missing:
    mov x0, #0
full_pick_push:
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_array_start:
    adr x0, str_array_marker
    b value_push
prim_array_end:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    mov x19, x22
    mov x20, #0
full_array_find_marker:
    mov x0, #0x40800000
    cmp x19, x0
    b.ls full_array_missing_marker
    sub x19, x19, #8
    ldr x0, [x19]
    adr x1, str_array_marker
    bl value_equal
    cbnz x0, full_array_literal_allocate
    add x20, x20, #1
    b full_array_find_marker
full_array_literal_allocate:
    mov x0, x20
    bl array_new
    mov x21, x0
    ldr x1, [x21, #16]
    add x2, x19, #8
full_array_literal_copy:
    cbz x20, full_array_literal_done
    ldr x3, [x2]
    str x3, [x1]
    add x1, x1, #8
    add x2, x2, #8
    sub x20, x20, #1
    b full_array_literal_copy
full_array_literal_done:
    mov x22, x19
    mov x0, x21
    bl value_push
    ldp x29, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #48
    ret
full_array_missing_marker:
    adr x0, full_array_syntax_message
    b runtime_error
prim_get:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl array_get
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_set:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x0, x1, [sp, #-16]!
    bl value_pop
    mov x2, x0
    ldp x0, x1, [sp], #16
    bl array_set
    ldp x29, x30, [sp], #16
    ret
prim_len:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    ldr x0, [x0]
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_array_value:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    bl prim_binary
    mov x20, x1
    mov x19, x0
    bl array_new
    ldr x1, [x0, #16]
full_array_value_fill:
    cbz x19, full_array_value_done
    str x20, [x1]
    add x1, x1, #8
    sub x19, x19, #1
    b full_array_value_fill
full_array_value_done:
    bl value_push
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
prim_array_fn:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    bl prim_binary
    mov x19, x0
    mov x20, x1
    mov x0, #0
    bl array_new
    mov x21, x0
    mov x25, #0
full_array_fn_loop:
    cmp x25, x19
    b.ge full_array_fn_push
    mov x0, x25
    bl value_push
    mov x0, x20
    bl runtime_call
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, full_array_fn_done
    bl value_pop
    mov x1, x0
    mov x0, x21
    bl array_append
    add x25, x25, #1
    b full_array_fn_loop
full_array_fn_push:
    mov x0, x21
    bl value_push
full_array_fn_done:
    ldp x29, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #48
    ret
prim_concat:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl string_concat
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_string_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl string_equal
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_string_less:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl string_compare
    cmp x0, #0
    cset x0, lt
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_string_less_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl string_compare
    cmp x0, #0
    cset x0, le
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_string_greater:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl string_compare
    cmp x0, #0
    cset x0, gt
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_string_greater_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl string_compare
    cmp x0, #0
    cset x0, ge
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_string_len:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl string_point_length
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_char_at:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl string_point_at
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_char_code:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl string_from_codepoint
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_byte_len:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    ldr x0, [x0]
    bl value_push
    ldp x29, x30, [sp], #16
    ret
// Parser cursors are byte offsets; malformed UTF8 advances one original byte.
prim_source_char_at:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    ldr x2, [x0]
    cmp x1, x2
    b.hs full_source_char_missing
    add x3, x0, #8
    add x0, x3, x1
    add x1, x3, x2
    bl utf8_decode
    bl string_from_codepoint
    b full_source_char_push
full_source_char_missing:
    mov x0, #0
full_source_char_push:
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_source_next:
    stp x19, x30, [sp, #-16]!
    bl prim_binary
    ldr x2, [x0]
    add x19, x0, #8
    cmp x1, x2
    b.hs full_source_next_end
    add x0, x19, x1
    add x1, x19, x2
    bl utf8_decode
    sub x0, x1, x19
    b full_source_next_push
full_source_next_end:
    mov x0, x2
full_source_next_push:
    bl value_push
    ldp x19, x30, [sp], #16
    ret
// Array indexOf compares raw words, including zero elements.
prim_index_of:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    ldr x2, [x0]
    ldr x3, [x0, #16]
    mov x0, #0
full_array_index_of_next:
    cmp x0, x2
    b.hs full_array_index_of_missing
    ldr x4, [x3, x0, lsl #3]
    cmp x4, x1
    b.eq full_array_index_of_found
    add x0, x0, #1
    b full_array_index_of_next
full_array_index_of_missing:
    mov x0, #-1
full_array_index_of_found:
    bl value_push
    ldp x29, x30, [sp], #16
    ret
// String search compares decoded scalars and returns a code-point position.
prim_string_index_of:
    stp x19, x20, [sp, #-80]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x28, xzr, [sp, #48]
    stp x29, x30, [sp, #64]
    bl prim_binary
    ldr x25, [x1]
    add x21, x1, #8
    add x25, x21, x25
    ldr x20, [x0]
    add x19, x0, #8
    add x20, x19, x20
    mov x27, x19
    mov x26, #0
full_index_of_outer:
    mov x9, x21
    mov x28, x27
full_index_of_inner:
    cmp x9, x25
    b.hs full_index_of_found
    cmp x28, x20
    b.hs full_index_of_next
    mov x0, x28
    mov x1, x20
    bl utf8_decode
    mov x10, x0
    mov x28, x1
    mov x0, x9
    mov x1, x25
    bl utf8_decode
    mov x9, x1
    cmp x0, x10
    b.ne full_index_of_next
    b full_index_of_inner
full_index_of_next:
    cmp x27, x20
    b.hs full_index_of_missing
    mov x0, x27
    mov x1, x20
    bl utf8_decode
    mov x27, x1
    add x26, x26, #1
    b full_index_of_outer
full_index_of_missing:
    mov x26, #-1
full_index_of_found:
    mov x0, x26
    bl value_push
    ldp x29, x30, [sp, #64]
    ldp x28, xzr, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #80
    ret
prim_depth:
    stp x29, x30, [sp, #-16]!
    mov x0, #0x40800000
    sub x0, x22, x0
    lsr x0, x0, #3
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_clear:
    mov x22, #0x40800000
    ret
prim_reset:
    b _start
prim_include:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    bl value_pop
    mov x19, x0
    adr x20, embedded_modules
full_include_loop:
    ldr x1, [x20]
    cbz x1, full_include_missing
    mov x0, x19
    bl string_equal
    cbnz x0, full_include_found
    add x20, x20, #16
    b full_include_loop
full_include_found:
    ldr x0, [x20, #8]
    bl t0_eval
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
full_include_missing:
    adr x0, full_include_message
    b runtime_error
full_division_zero:
    adr x0, full_division_message
    b runtime_error
full_negative_exponent:
    adr x0, full_exponent_message
    b runtime_error
full_invalid_integer:
    adr x0, full_integer_message
    b runtime_error
full_division_message:
    .asciz "division by zero"
full_exponent_message:
    .asciz "negative integer exponent"
full_integer_message:
    .asciz "invalid integer"
full_array_syntax_message:
    .asciz "unmatched array close"
full_include_message:
    .asciz "module is not bundled into this image"
.align 3

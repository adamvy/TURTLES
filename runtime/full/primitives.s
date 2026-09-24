// All runtime primitives in T0.js. Compiler forms live in core.s.
prim_binary:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    stp x0, xzr, [sp, #-16]!
    bl value_pop
    ldp x1, xzr, [sp], #16
    ldp x29, x30, [sp], #16
    ret
prim_numeric:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    stp x1, xzr, [sp, #-16]!
    bl value_to_number
    fmov x1, d0
    ldr x0, [sp]
    str x1, [sp]
    bl value_to_number
    fmov d1, d0
    ldp x0, xzr, [sp], #16
    fmov d0, x0
    ldp x29, x30, [sp], #16
    ret
prim_boolean:
    lsl x0, x0, #2
    add x0, x0, #2
    b value_push
prim_add:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    bl prim_binary
    mov x20, x1
    bl value_to_primitive
    mov x19, x0
    mov x0, x20
    bl value_to_primitive
    mov x20, x0
    cmp x19, #18
    b.ls full_add_check_b
    ldr x1, [x19]
    cmp x1, #1
    b.eq full_add_strings
full_add_check_b:
    cmp x20, #18
    b.ls full_add_numbers
    ldr x1, [x20]
    cmp x1, #1
    b.eq full_add_strings
full_add_numbers:
    mov x0, x19
    bl value_to_number
    fmov x19, d0
    mov x0, x20
    bl value_to_number
    fmov d1, x19
    fadd d0, d1, d0
    bl number_box
    b full_add_push
full_add_strings:
    mov x0, x19
    bl value_to_string
    mov x19, x0
    mov x0, x20
    bl value_to_string
    mov x1, x0
    mov x0, x19
    bl string_concat
full_add_push:
    bl value_push
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
prim_sub:
    stp x29, x30, [sp, #-16]!
    bl prim_numeric
    fsub d0, d0, d1
    bl number_box
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_mul:
    stp x29, x30, [sp, #-16]!
    bl prim_numeric
    fmul d0, d0, d1
    bl number_box
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_div:
    stp x29, x30, [sp, #-16]!
    bl prim_numeric
    fdiv d0, d0, d1
    bl number_box
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_mod:
    stp x29, x30, [sp, #-16]!
    bl prim_numeric
    bl number_mod
    bl number_box
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_pow:
    stp x29, x30, [sp, #-16]!
    bl prim_numeric
    bl number_pow
    bl number_box
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_percent:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl value_to_number
    mov x0, #100
    scvtf d1, x0
    fdiv d0, d0, d1
    bl number_box
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl value_equal
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
prim_not_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_binary
    bl value_equal
    cmp x0, #0
    cset x0, eq
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
// Compare preserves JS string ordering and numeric coercion. Output native
// comparison -1/0/1; unordered NaN=2 (all relational operators false).
prim_compare:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    bl prim_binary
    mov x20, x1
    bl value_to_primitive
    mov x19, x0
    mov x0, x20
    bl value_to_primitive
    mov x20, x0
    cmp x19, #18
    b.ls full_compare_numbers
    cmp x20, #18
    b.ls full_compare_numbers
    ldr x1, [x19]
    ldr x2, [x20]
    cmp x1, #1
    b.ne full_compare_numbers
    cmp x2, #1
    b.ne full_compare_numbers
    mov x0, x19
    mov x1, x20
    bl string_compare
    b full_compare_done
full_compare_numbers:
    mov x0, x19
    bl value_to_number
    fmov x19, d0
    mov x0, x20
    bl value_to_number
    fmov d1, x19
    fcmp d1, d0
    b.vs full_compare_nan
    b.lt full_compare_less
    cset x0, gt
    b full_compare_done
full_compare_less:
    mov x0, #-1
    b full_compare_done
full_compare_nan:
    mov x0, #2
full_compare_done:
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
prim_less:
    stp x29, x30, [sp, #-16]!
    bl prim_compare
    cmp x0, #0
    cset x0, lt
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
prim_less_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_compare
    cmp x0, #0
    cset x0, le
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
prim_greater:
    stp x29, x30, [sp, #-16]!
    bl prim_compare
    cmp x0, #1
    cset x0, eq
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
prim_greater_equal:
    stp x29, x30, [sp, #-16]!
    bl prim_compare
    cmp x0, #1
    cset x0, ls
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
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
    mov x0, #2
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
    mov x0, #6
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
    // Upstream eval$ reads src.length before calling src.charAt. Primitive
    // numbers/booleans and zero-length arrays/functions therefore do nothing.
    cmp x0, #10
    b.eq full_null_access
    cmp x0, #14
    b.eq full_null_access
    cmp x0, #18
    b.ls full_eval_done
    ldr x1, [x0]
    cmp x1, #1
    b.eq full_eval_source
    cmp x1, #3
    b.ne full_eval_done
    ldr x1, [x0, #8]
    cbnz x1, full_type_error
    b full_eval_done
full_eval_source:
    bl t0_eval
full_eval_done:
    ldp x29, x30, [sp], #16
    ret
prim_print:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl print_value
    bl newline
    ldp x29, x30, [sp], #16
    ret
prim_debugger:
    ret
prim_const:
    stp x19, x30, [sp, #-16]!
    bl prim_binary
    mov x19, x0
    mov x0, x1
    bl value_to_string
    mov x1, x19
    mov x2, #0
    bl core_define
    ldp x19, x30, [sp], #16
    ret
prim_semicolon:
    stp x19, x30, [sp, #-16]!
    bl prim_binary
    mov x19, x1
    bl value_to_string
    mov x1, x19
    mov x2, #0
    bl core_define
    ldp x19, x30, [sp], #16
    ret
prim_parse_float:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl value_to_string
    mov x1, #0
    bl number_parse
    bl number_box
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_pick:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl value_to_number
    mov x0, #0x40800000
    sub x1, x22, x0
    lsr x1, x1, #3
    sub x1, x1, #1
    scvtf d1, x1
    fsub d0, d1, d0
    fcvtzs x2, d0
    scvtf d1, x2
    fcmp d0, d1
    b.ne full_pick_undefined
    cmp x2, x1
    b.hi full_pick_undefined
    cmp x2, #0
    b.lt full_pick_undefined
    ldr x0, [x0, x2, lsl #3]
    b full_pick_push
full_pick_undefined:
    mov x0, #10
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
    mov x0, #0x40800000
    cmp x19, x0
    b.eq full_array_literal_allocate
    add x20, x20, #1
    b full_array_find_marker
full_array_literal_allocate:
    mov x0, x20
    bl array_new
    mov x21, x0
    ldr x1, [x21, #24]
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
    adr x1, str_length
    bl array_get
    bl value_push
    ldp x29, x30, [sp], #16
    ret
// For a JS for(i=0;i<length;i++) constructor, positive fractions round up.
full_constructor_length:
    stp x29, x30, [sp, #-16]!
    bl value_to_number
    fcmp d0, #0
    b.le full_constructor_zero
    b.vs full_constructor_zero
    fcvtzs x0, d0
    scvtf d1, x0
    fcmp d1, d0
    b.eq full_constructor_count
    add x0, x0, #1
full_constructor_count:
    mov x1, #0xffffffff
    cmp x0, x1
    b.hi fatal_arena
    ldp x29, x30, [sp], #16
    ret
full_constructor_zero:
    mov x0, #0
    ldp x29, x30, [sp], #16
    ret
prim_array_value:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    bl prim_binary
    mov x20, x1
    bl full_constructor_length
    mov x19, x0
    bl array_new
    ldr x1, [x0, #24]
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
    // JS tests i < length on every iteration. The callback may mutate an
    // array used as length, or return before a huge requested allocation.
    mov x0, x19
    bl value_to_number
    scvtf d1, x25
    fcmp d1, d0
    b.vs full_array_fn_push
    b.ge full_array_fn_push
    mov x0, x25
    bl number_from_int
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
prim_string_query:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl value_kind
    cmp x0, #1
    cset x0, eq
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
prim_array_query:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl value_kind
    cmp x0, #3
    cset x0, eq
    bl prim_boolean
    ldp x29, x30, [sp], #16
    ret
prim_char_at:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    bl prim_binary
    mov x19, x0
    mov x20, x1
    adr x1, str_length
    bl array_get
    bl value_to_number
    fmov x21, d0
    mov x0, x20
    bl value_to_number
    fmov d1, x21
    fcmp d0, d1
    b.vs full_char_at_null
    b.ge full_char_at_null
    mov x0, x19
    // Preserve the numeric index over type validation.
    fmov x20, d0
    bl full_require_string
    fmov d0, x20
    fcvtzs x1, d0
    cmp x1, #0
    b.lt full_char_at_empty
    ldr x2, [x19, #8]
    cmp x1, x2
    b.hs full_char_at_empty
    add x0, x19, #16
    add x0, x0, x1, lsl #1
    mov x1, #1
    bl string_new
    b full_char_at_push
full_char_at_null:
    mov x0, #14
    b full_char_at_push
full_char_at_empty:
    adr x0, str_empty
full_char_at_push:
    bl value_push
    ldp x29, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #48
    ret
// ToUint16 follows binary64 exponent/mantissa, including huge finite numbers.
number_uint16:
    fmov x0, d0
    lsr x1, x0, #52
    and x1, x1, #2047
    cmp x1, #2047
    b.eq full_uint16_zero
    sub x1, x1, #1023
    cmp x1, #0
    b.lt full_uint16_zero
    and x2, x0, #0xfffffffffffff
    mov x3, #0x10000000000000
    orr x2, x2, x3
    cmp x1, #52
    b.ge full_uint16_left
    mov x3, #52
    sub x3, x3, x1
    lsr x2, x2, x3
    b full_uint16_sign
full_uint16_left:
    sub x1, x1, #52
    cmp x1, #16
    b.hs full_uint16_zero
    lsl x2, x2, x1
full_uint16_sign:
    tbz x0, #63, full_uint16_positive
    neg x2, x2
full_uint16_positive:
    and x0, x2, #65535
    ret
full_uint16_zero:
    mov x0, #0
    ret
prim_char_code:
    stp x29, x30, [sp, #-16]!
    bl value_pop
    bl value_to_number
    bl number_uint16
    stp x0, xzr, [sp, #-16]!
    mov x0, sp
    mov x1, #1
    bl string_new
    add sp, sp, #16
    bl value_push
    ldp x29, x30, [sp], #16
    ret
prim_index_of:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x29, x30, [sp, #48]
    bl prim_binary
    mov x19, x0
    mov x20, x1
    cmp x19, #18
    b.ls full_type_error
    ldr x1, [x19]
    cmp x1, #3
    b.eq full_array_index_of
    cmp x1, #1
    b.ne full_type_error
    mov x0, x20
    bl value_to_string
    mov x20, x0
    ldr x21, [x19, #8]
    ldr x25, [x20, #8]
    add x19, x19, #16
    add x20, x20, #16
    mov x26, #0
full_index_of_outer:
    add x1, x26, x25
    cmp x1, x21
    b.hi full_index_of_missing
    mov x27, #0
full_index_of_inner:
    cmp x27, x25
    b.hs full_index_of_found
    add x1, x26, x27
    ldrh w2, [x19, x1, lsl #1]
    ldrh w3, [x20, x27, lsl #1]
    cmp w2, w3
    b.ne full_index_of_next
    add x27, x27, #1
    b full_index_of_inner
full_index_of_next:
    add x26, x26, #1
    b full_index_of_outer
full_array_index_of:
    mov x26, #0
    ldr x21, [x19, #8]
full_array_index_of_next:
    cmp x26, x21
    b.hs full_index_of_missing
    ldr x1, [x19, #24]
    ldr x0, [x1, x26, lsl #3]
    cbz x0, full_array_index_of_skip_hole
    mov x1, x20
    bl value_equal
    cbnz x0, full_index_of_found
full_array_index_of_skip_hole:
    add x26, x26, #1
    b full_array_index_of_next
full_index_of_missing:
    mov x26, #-1
full_index_of_found:
    mov x0, x26
    bl number_from_int
    bl value_push
    ldp x29, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret
full_require_string:
    cmp x0, #18
    b.ls full_type_error
    ldr x1, [x0]
    cmp x1, #1
    b.ne full_type_error
    ret
full_type_error:
    adr x0, full_type_message
    b runtime_error
prim_depth:
    stp x29, x30, [sp, #-16]!
    mov x0, #0x40800000
    sub x0, x22, x0
    lsr x0, x0, #3
    bl number_from_int
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
    bl value_to_string
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
full_type_message:
    .asciz "operation requires another value type"
full_array_syntax_message:
    .asciz "unmatched array close"
full_include_message:
    .asciz "module is not bundled into this image"
.align 3

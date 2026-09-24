// UTF16 strings, binary64 values, arrays and JavaScript coercions.
number_box:
    stp x29, x30, [sp, #-16]!
    fmov x4, d0
    stp x4, xzr, [sp, #-16]!
    mov x0, #16
    bl heap_alloc
    ldp x4, xzr, [sp], #16
    mov x1, #4
    str x1, [x0]
    str x4, [x0, #8]
    ldp x29, x30, [sp], #16
    ret
number_from_int:
    scvtf d0, x0
    b number_box
// x0 points at valid UTF16, x1 count. Overflow checks precede allocation.
string_new:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    mov x2, #0x10000000
    cmp x1, x2
    b.hs fatal_heap
    lsl x0, x1, #1
    add x0, x0, #18
    bl heap_alloc
    mov x1, #1
    str x1, [x0]
    str x20, [x0, #8]
    add x1, x0, #16
full_str_copy:
    cbz x20, full_str_end
    ldrh w2, [x19]
    strh w2, [x1]
    add x19, x19, #2
    add x1, x1, #2
    sub x20, x20, #1
    b full_str_copy
full_str_end:
    strh wzr, [x1]
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
string_equal:
    cmp x0, x1
    b.eq full_str_equal_yes
    ldr x2, [x0, #8]
    ldr x3, [x1, #8]
    cmp x2, x3
    b.ne full_str_equal_no
    add x0, x0, #16
    add x1, x1, #16
full_str_equal_loop:
    cbz x2, full_str_equal_yes
    ldrh w3, [x0]
    ldrh w4, [x1]
    cmp w3, w4
    b.ne full_str_equal_no
    add x0, x0, #2
    add x1, x1, #2
    sub x2, x2, #1
    b full_str_equal_loop
full_str_equal_yes:
    mov x0, #1
    ret
full_str_equal_no:
    mov x0, #0
    ret
string_compare:
    ldr x2, [x0, #8]
    ldr x3, [x1, #8]
    add x0, x0, #16
    add x1, x1, #16
full_str_compare_loop:
    cbz x2, full_str_compare_a_end
    cbz x3, full_str_compare_greater
    ldrh w4, [x0]
    ldrh w5, [x1]
    cmp w4, w5
    b.lo full_str_compare_less
    b.hi full_str_compare_greater
    add x0, x0, #2
    add x1, x1, #2
    sub x2, x2, #1
    sub x3, x3, #1
    b full_str_compare_loop
full_str_compare_a_end:
    cbnz x3, full_str_compare_less
    mov x0, #0
    ret
full_str_compare_less:
    mov x0, #-1
    ret
full_str_compare_greater:
    mov x0, #1
    ret
string_concat:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    ldr x0, [x19, #8]
    ldr x1, [x20, #8]
    add x0, x0, x1
    lsl x0, x0, #1
    add x0, x0, #18
    bl heap_alloc
    mov x1, #1
    str x1, [x0]
    ldr x2, [x19, #8]
    ldr x3, [x20, #8]
    add x1, x2, x3
    str x1, [x0, #8]
    add x1, x0, #16
    add x19, x19, #16
    add x20, x20, #16
full_concat_first:
    cbz x2, full_concat_second
    ldrh w4, [x19]
    strh w4, [x1]
    add x19, x19, #2
    add x1, x1, #2
    sub x2, x2, #1
    b full_concat_first
full_concat_second:
    cbz x3, full_concat_end
    ldrh w4, [x20]
    strh w4, [x1]
    add x20, x20, #2
    add x1, x1, #2
    sub x3, x3, #1
    b full_concat_second
full_concat_end:
    strh wzr, [x1]
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

// Decode valid UTF8, replacing malformed sequences with U+FFFD. Each incoming
// byte can produce at most one UTF16 code unit, so reserve a checked upper bound.
string_from_utf8:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x29, x30, [sp, #48]
    mov x19, x0
    add x20, x0, x1
    lsl x0, x1, #1
    add x0, x0, #18
    bl heap_alloc
    mov x21, x0
    mov x1, #1
    str x1, [x21]
    add x25, x21, #16
    mov x26, #0
full_utf8_next:
    cmp x19, x20
    b.hs full_utf8_done
    ldrb w0, [x19]
    add x19, x19, #1
    cmp x0, #128
    b.lo full_utf8_emit
    mov x27, #0
    cmp x0, #0xc2
    b.lo full_utf8_invalid
    cmp x0, #0xe0
    b.lo full_utf8_two
    cmp x0, #0xf0
    b.lo full_utf8_three
    cmp x0, #0xf5
    b.hs full_utf8_invalid
    and x0, x0, #7
    mov x2, #3
    mov x3, #0x10000
    b full_utf8_continue
full_utf8_three:
    and x0, x0, #15
    mov x2, #2
    mov x3, #0x800
    b full_utf8_continue
full_utf8_two:
    and x0, x0, #31
    mov x2, #1
    mov x3, #128
full_utf8_continue:
    cmp x19, x20
    b.hs full_utf8_invalid
    ldrb w1, [x19]
    and x4, x1, #0xc0
    cmp x4, #0x80
    b.ne full_utf8_invalid
    add x19, x19, #1
    lsl x0, x0, #6
    and x1, x1, #63
    orr x0, x0, x1
    sub x2, x2, #1
    cbnz x2, full_utf8_continue
    cmp x0, x3
    b.lo full_utf8_invalid
    mov x1, #0x110000
    cmp x0, x1
    b.hs full_utf8_invalid
    mov x1, #0xd800
    cmp x0, x1
    b.lo full_utf8_check_pair
    mov x1, #0xe000
    cmp x0, x1
    b.lo full_utf8_invalid
full_utf8_check_pair:
    mov x1, #0x10000
    cmp x0, x1
    b.lo full_utf8_emit
    sub x0, x0, x1
    lsr x1, x0, #10
    mov x2, #0xd800
    add x1, x1, x2
    strh w1, [x25]
    add x25, x25, #2
    add x26, x26, #1
    and x0, x0, #1023
    mov x1, #0xdc00
    add x0, x0, x1
    b full_utf8_emit
full_utf8_invalid:
    mov x0, #0xfffd
full_utf8_emit:
    strh w0, [x25]
    add x25, x25, #2
    add x26, x26, #1
    b full_utf8_next
full_utf8_done:
    strh wzr, [x25]
    str x26, [x21, #8]
    mov x0, x21
    ldp x29, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

// Print a Unicode scalar as UTF8. Isolated surrogates become U+FFFD.
unicode_put:
    stp x19, x30, [sp, #-16]!
    mov x19, x0
    cmp x19, #128
    b.lo full_unicode_last
    cmp x19, #0x800
    b.lo full_unicode_two
    mov x1, #0x10000
    cmp x19, x1
    b.lo full_unicode_three
    lsr x0, x19, #18
    orr x0, x0, #0xf0
    bl uart_putc
    lsr x0, x19, #12
    and x0, x0, #63
    orr x0, x0, #128
    bl uart_putc
    b full_unicode_two_tail
full_unicode_three:
    lsr x0, x19, #12
    orr x0, x0, #0xe0
    bl uart_putc
    b full_unicode_two_tail
full_unicode_two:
    lsr x0, x19, #6
    orr x0, x0, #0xc0
    bl uart_putc
    b full_unicode_last_tail
full_unicode_two_tail:
    lsr x0, x19, #6
    and x0, x0, #63
    orr x0, x0, #128
    bl uart_putc
full_unicode_last_tail:
    and x19, x19, #63
    orr x19, x19, #128
full_unicode_last:
    mov x0, x19
    bl uart_putc
    ldp x19, x30, [sp], #16
    ret
print_string:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    ldr x20, [x0, #8]
    add x19, x0, #16
full_print_string_next:
    cbz x20, full_print_string_done
    ldrh w0, [x19]
    add x19, x19, #2
    sub x20, x20, #1
    mov x1, #0xd800
    cmp x0, x1
    b.lo full_print_string_emit
    mov x1, #0xe000
    cmp x0, x1
    b.hs full_print_string_emit
    mov x1, #0xdc00
    cmp x0, x1
    b.hs full_print_string_invalid
    cbz x20, full_print_string_invalid
    ldrh w2, [x19]
    cmp x2, x1
    b.lo full_print_string_invalid
    mov x3, #0xe000
    cmp x2, x3
    b.hs full_print_string_invalid
    sub x2, x2, x1
    mov x1, #0xd800
    sub x0, x0, x1
    lsl x0, x0, #10
    add x0, x0, x2
    mov x1, #0x10000
    add x0, x0, x1
    add x19, x19, #2
    sub x20, x20, #1
    b full_print_string_emit
full_print_string_invalid:
    mov x0, #0xfffd
full_print_string_emit:
    bl unicode_put
    b full_print_string_next
full_print_string_done:
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

value_kind:
    cmp x0, #18
    b.ls full_kind_primitive
    ldr x0, [x0]
    ret
full_kind_primitive:
    cmp x0, #2
    b.eq full_kind_bool
    cmp x0, #6
    b.eq full_kind_bool
    cmp x0, #10
    b.eq full_kind_undefined
    cmp x0, #14
    b.eq full_kind_null
    mov x0, #8
    ret
full_kind_bool:
    mov x0, #5
    ret
full_kind_undefined:
    mov x0, #6
    ret
full_kind_null:
    mov x0, #7
    ret
value_truthy:
    cmp x0, #2
    b.eq full_truth_false
    cmp x0, #10
    b.eq full_truth_false
    cmp x0, #14
    b.eq full_truth_false
    cmp x0, #18
    b.ls full_truth_true
    ldr x1, [x0]
    cmp x1, #1
    b.eq full_truth_string
    cmp x1, #4
    b.ne full_truth_true
    ldr x1, [x0, #8]
    fmov d0, x1
    fmov d1, xzr
    fcmp d0, d1
    b.eq full_truth_false
    b.vs full_truth_false
    b full_truth_true
full_truth_string:
    ldr x1, [x0, #8]
    cbz x1, full_truth_false
full_truth_true:
    mov x0, #1
    ret
full_truth_false:
    mov x0, #0
    ret
value_equal:
    cmp x0, #18
    b.ls full_equal_identity
    cmp x1, #18
    b.ls full_equal_identity
    ldr x2, [x0]
    ldr x3, [x1]
    cmp x2, x3
    b.ne full_equal_false
    cmp x2, #1
    b.eq string_equal
    cmp x2, #4
    b.ne full_equal_identity
    ldr x2, [x0, #8]
    ldr x3, [x1, #8]
    fmov d0, x2
    fmov d1, x3
    fcmp d0, d1
    cset x0, eq
    ret
full_equal_identity:
    cmp x0, x1
    cset x0, eq
    ret
full_equal_false:
    mov x0, #0
    ret

// Arrays use sparse properties for nonindices and can grow their backing store.
array_new:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x1, #0xffffffff
    cmp x19, x1
    b.hi full_array_bad_length
    mov x0, #40
    bl heap_alloc
    mov x20, x0
    mov x1, #3
    str x1, [x20]
    str x19, [x20, #8]
    str x19, [x20, #16]
    str xzr, [x20, #32]
    lsl x0, x19, #3
    bl arena_alloc
    str x0, [x20, #24]
    mov x1, #0
full_array_init:
    cbz x19, full_array_init_done
    str x1, [x0]
    add x0, x0, #8
    sub x19, x19, #1
    b full_array_init
full_array_init_done:
    mov x0, x20
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
full_array_bad_length:
    adr x0, full_bad_length_message
    b runtime_error
// x0=array,x1=index raw; grow checked, no collection/free of old backing.
array_ensure:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    mov x19, x0
    add x20, x1, #1
    ldr x2, [x19, #8]
    cmp x20, x2
    b.ls full_array_ensure_done
    ldr x21, [x19, #16]
    cmp x20, x21
    b.ls full_array_set_length
    lsl x21, x21, #1
    cmp x21, x20
    csel x21, x21, x20, hs
    mov x1, #0xffffffff
    cmp x21, x1
    csel x21, x21, x20, ls
    lsl x0, x21, #3
    bl arena_alloc
    ldr x2, [x19, #24]
    ldr x3, [x19, #8]
    str x0, [x19, #24]
    str x21, [x19, #16]
    mov x25, x0
full_array_grow_copy:
    cbz x3, full_array_grow_fill
    ldr x4, [x2]
    str x4, [x0]
    add x2, x2, #8
    add x0, x0, #8
    sub x3, x3, #1
    sub x21, x21, #1
    b full_array_grow_copy
full_array_grow_fill:
    mov x4, #0
full_array_grow_fill_loop:
    cbz x21, full_array_set_length
    str x4, [x0]
    add x0, x0, #8
    sub x21, x21, #1
    b full_array_grow_fill_loop
full_array_set_length:
    str x20, [x19, #8]
full_array_ensure_done:
    mov x0, x19
    ldp x29, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #48
    ret
array_append:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    ldr x1, [x0, #8]
    mov x2, #0xfffffffe
    cmp x1, x2
    b.hi full_array_bad_length
    bl array_ensure
    ldr x1, [x19, #8]
    sub x1, x1, #1
    ldr x2, [x19, #24]
    str x20, [x2, x1, lsl #3]
    mov x0, x19
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
// Canonical JS array index: a property key string 0..2^32-2, no leading zero.
property_index:
    ldr x1, [x0, #8]
    cbz x1, full_index_no
    cmp x1, #10
    b.hi full_index_no
    add x2, x0, #16
    ldrh w3, [x2]
    cmp w3, #48
    b.ne full_index_loop_start
    cmp x1, #1
    b.ne full_index_no
full_index_loop_start:
    mov x0, #0
    mov x4, #10
full_index_loop:
    cbz x1, full_index_check
    ldrh w3, [x2]
    cmp w3, #48
    b.lo full_index_no
    cmp w3, #57
    b.hi full_index_no
    sub x3, x3, #48
    mul x0, x0, x4
    add x0, x0, x3
    add x2, x2, #2
    sub x1, x1, #1
    b full_index_loop
full_index_check:
    mov x2, #0xfffffffe
    cmp x0, x2
    b.hi full_index_no
    mov x1, #1
    ret
full_index_no:
    mov x0, #0
    mov x1, #0
    ret

array_get:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    mov x19, x0
    // Numeric indices dominate parser workloads. Avoid formatting and parsing
    // their decimal property names when ToPropertyKey gives an array index.
    cmp x19, #18
    b.ls full_get_slow_key
    ldr x2, [x19]
    cmp x2, #2
    b.eq full_get_slow_key
    cmp x1, #18
    b.ls full_get_slow_key
    ldr x2, [x1]
    cmp x2, #4
    b.ne full_get_slow_key
    ldr x2, [x1, #8]
    fmov d0, x2
    fcvtzs x21, d0
    scvtf d1, x21
    fcmp d0, d1
    b.ne full_get_slow_key
    mov x2, #0xfffffffe
    cmp x21, x2
    b.ls full_get_numeric_index
full_get_slow_key:
    mov x0, x1
    bl value_to_string
    mov x20, x0
    adr x1, str_length
    bl string_equal
    cbnz x0, full_get_length
    cmp x19, #18
    b.ls full_get_primitive
    ldr x1, [x19]
    cmp x1, #2
    b.eq full_get_property
    mov x0, x20
    bl property_index
    cbz x1, full_get_property
    mov x21, x0
full_get_numeric_index:
    cmp x19, #18
    b.ls full_get_primitive
    ldr x1, [x19]
    cmp x1, #3
    b.eq full_get_array_index
    cmp x1, #1
    b.ne full_get_missing
    ldr x1, [x19, #8]
    cmp x21, x1
    b.hs full_get_missing
    add x0, x19, #16
    add x0, x0, x21, lsl #1
    mov x1, #1
    bl string_new
    b full_get_done
full_get_array_index:
    ldr x1, [x19, #8]
    cmp x21, x1
    b.hs full_get_missing
    ldr x1, [x19, #24]
    ldr x0, [x1, x21, lsl #3]
    cbnz x0, full_get_done
    mov x0, #10
    b full_get_done
full_get_length:
    cmp x19, #18
    b.ls full_get_primitive
    ldr x1, [x19]
    cmp x1, #2
    b.eq full_get_function_length
    cmp x1, #1
    b.eq full_get_string_length
    cmp x1, #3
    b.ne full_get_missing
full_get_string_length:
    ldr x0, [x19, #8]
    bl number_from_int
    b full_get_done
full_get_function_length:
    mov x0, #0
    bl number_from_int
    b full_get_done
full_get_property:
    cmp x19, #18
    b.ls full_get_primitive
    ldr x1, [x19]
    cmp x1, #2
    b.eq full_get_closure_property
    cmp x1, #3
    b.ne full_get_missing
    ldr x21, [x19, #32]
    b full_get_property_loop
full_get_closure_property:
    ldr x21, [x19, #24]
full_get_property_loop:
    cbz x21, full_get_missing
    mov x0, x20
    ldr x1, [x21, #8]
    bl string_equal
    cbnz x0, full_get_property_found
    ldr x21, [x21]
    b full_get_property_loop
full_get_property_found:
    ldr x0, [x21, #16]
    b full_get_done
full_get_primitive:
    cmp x19, #10
    b.eq full_null_access
    cmp x19, #14
    b.eq full_null_access
full_get_missing:
    mov x0, #10
full_get_done:
    ldp x29, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #48
    ret
full_null_access:
    adr x0, full_null_access_message
    b runtime_error

array_set:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x29, x30, [sp, #48]
    mov x19, x0
    mov x21, x2
    cmp x19, #10
    b.eq full_null_access
    cmp x19, #14
    b.eq full_null_access
    cmp x19, #18
    b.ls full_set_done
    ldr x2, [x19]
    cmp x2, #2
    b.eq full_set_closure_key
    cmp x2, #3
    b.ne full_set_done
    cmp x1, #18
    b.ls full_set_closure_key
    ldr x2, [x1]
    cmp x2, #4
    b.ne full_set_closure_key
    ldr x2, [x1, #8]
    fmov d0, x2
    fcvtzs x25, d0
    scvtf d1, x25
    fcmp d0, d1
    b.ne full_set_closure_key
    mov x2, #0xfffffffe
    cmp x25, x2
    b.ls full_set_numeric_index
full_set_closure_key:
    mov x0, x1
    bl value_to_string
    mov x20, x0
    adr x1, str_length
    bl string_equal
    cbnz x0, full_set_length
    ldr x1, [x19]
    cmp x1, #2
    b.eq full_set_property
    mov x0, x20
    bl property_index
    cbz x1, full_set_property
    mov x25, x0
full_set_numeric_index:
    mov x1, x25
    mov x0, x19
    bl array_ensure
    ldr x0, [x19, #24]
    str x21, [x0, x25, lsl #3]
    b full_set_done
full_set_length:
    ldr x1, [x19]
    cmp x1, #2
    b.eq full_set_done
    mov x0, x21
    bl value_to_number
    fcvtzs x25, d0
    scvtf d1, x25
    fcmp d0, d1
    b.ne full_array_bad_length
    mov x1, #0xffffffff
    cmp x25, x1
    b.hi full_array_bad_length
    ldr x2, [x19, #8]
    cmp x25, x2
    b.hs full_set_length_grow
    ldr x0, [x19, #24]
    mov x3, #0
    mov x4, x25
full_set_length_clear:
    cmp x4, x2
    b.hs full_set_length_store
    str x3, [x0, x4, lsl #3]
    add x4, x4, #1
    b full_set_length_clear
full_set_length_store:
    str x25, [x19, #8]
    b full_set_done
full_set_length_grow:
    cbz x25, full_set_done
    mov x0, x19
    sub x1, x25, #1
    bl array_ensure
    b full_set_done
full_set_property:
    mov x27, #32
    ldr x1, [x19]
    cmp x1, #2
    b.ne full_set_property_offset
    mov x27, #24
full_set_property_offset:
    ldr x25, [x19, x27]
full_set_property_loop:
    cbz x25, full_set_property_new
    mov x0, x20
    ldr x1, [x25, #8]
    bl string_equal
    cbnz x0, full_set_property_write
    ldr x25, [x25]
    b full_set_property_loop
full_set_property_new:
    mov x0, #24
    bl arena_alloc
    mov x25, x0
    ldr x1, [x19, x27]
    str x1, [x25]
    str x20, [x25, #8]
    str x25, [x19, x27]
full_set_property_write:
    str x21, [x25, #16]
full_set_done:
    ldp x29, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

value_to_primitive:
    cmp x0, #18
    b.ls full_primitive_done
    ldr x1, [x0]
    cmp x1, #2
    b.eq value_to_string
    cmp x1, #3
    b.eq value_to_string
full_primitive_done:
    ret
value_to_number:
    cmp x0, #2
    b.eq full_number_zero
    cmp x0, #14
    b.eq full_number_zero
    cmp x0, #6
    b.eq full_number_one
    cmp x0, #18
    b.ls full_number_nan
    ldr x1, [x0]
    cmp x1, #4
    b.eq full_number_unbox
    cmp x1, #1
    b.eq full_number_string
    stp x29, x30, [sp, #-16]!
    bl value_to_string
    mov x1, #1
    bl number_parse
    ldp x29, x30, [sp], #16
    ret
full_number_string:
    mov x1, #1
    b number_parse
full_number_unbox:
    ldr x0, [x0, #8]
    fmov d0, x0
    ret
full_number_zero:
    fmov d0, xzr
    ret
full_number_one:
    mov x0, #1
    scvtf d0, x0
    ret
full_number_nan:
    mov x0, #0x7ff8000000000000
    fmov d0, x0
    ret

// toString array traversal keeps an explicit active chain to elide cycles like JS.
value_to_string:
    mov x1, sp
    mov x2, #0x40a00000
    cmp x1, x2
    b.lo fatal_native
    stp x19, x20, [sp, #-80]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x28, x29, [sp, #48]
    str x30, [sp, #64]
    cmp x0, #2
    b.eq full_string_false
    cmp x0, #6
    b.eq full_string_true
    cmp x0, #10
    b.eq full_string_undefined
    cmp x0, #14
    b.eq full_string_null
    cmp x0, #18
    b.ls full_string_marker
    ldr x1, [x0]
    cmp x1, #1
    b.eq full_string_done
    cmp x1, #2
    b.eq full_string_closure
    cmp x1, #3
    b.eq full_string_array
    ldr x1, [x0, #8]
    fmov d0, x1
    bl number_format
    b full_string_done
full_string_false:
    adr x0, str_false
    b full_string_done
full_string_true:
    adr x0, str_true
    b full_string_done
full_string_undefined:
    adr x0, str_undefined
    b full_string_done
full_string_null:
    adr x0, str_null
    b full_string_done
full_string_marker:
    adr x0, str_array_marker
    b full_string_done
full_string_closure:
    ldr x0, [x0, #8]
    ldr x0, [x0, #32]
    b full_string_done
full_string_array:
    mov x19, x0
    adr x1, stringify_active
    ldr x2, [x1]
full_string_cycle_check:
    cbz x2, full_string_array_begin
    ldr x3, [x2]
    cmp x3, x19
    b.eq full_string_cycle
    ldr x2, [x2, #8]
    b full_string_cycle_check
full_string_cycle:
    adr x0, str_empty
    b full_string_done
full_string_array_begin:
    ldr x2, [x1]
    stp x19, x2, [sp, #-16]!
    mov x2, sp
    str x2, [x1]
    ldr x20, [x19, #8]
    lsl x0, x20, #3
    bl arena_alloc
    mov x21, x0
    mov x25, #0
    mov x26, #0
    cbz x20, full_string_array_allocate
    sub x26, x20, #1
full_string_array_parts:
    cmp x25, x20
    b.hs full_string_array_allocate
    ldr x1, [x19, #24]
    ldr x0, [x1, x25, lsl #3]
    cbz x0, full_string_array_empty_part
    cmp x0, #10
    b.eq full_string_array_empty_part
    cmp x0, #14
    b.eq full_string_array_empty_part
    bl value_to_string
    b full_string_array_part
full_string_array_empty_part:
    adr x0, str_empty
full_string_array_part:
    str x0, [x21, x25, lsl #3]
    ldr x1, [x0, #8]
    adds x26, x26, x1
    b.cs fatal_heap
    add x25, x25, #1
    b full_string_array_parts
full_string_array_allocate:
    mov x1, #0x10000000
    cmp x26, x1
    b.hs fatal_heap
    lsl x0, x26, #1
    add x0, x0, #18
    bl heap_alloc
    mov x27, x0
    mov x1, #1
    str x1, [x27]
    str x26, [x27, #8]
    add x28, x27, #16
    mov x25, #0
full_string_array_join:
    cmp x25, x20
    b.hs full_string_array_end
    cbz x25, full_string_array_load
    mov x1, #44
    strh w1, [x28]
    add x28, x28, #2
full_string_array_load:
    ldr x0, [x21, x25, lsl #3]
    ldr x1, [x0, #8]
    add x0, x0, #16
full_string_array_copy:
    cbz x1, full_string_array_copied
    ldrh w2, [x0]
    strh w2, [x28]
    add x0, x0, #2
    add x28, x28, #2
    sub x1, x1, #1
    b full_string_array_copy
full_string_array_copied:
    add x25, x25, #1
    b full_string_array_join
full_string_array_end:
    strh wzr, [x28]
    ldp x1, x2, [sp], #16
    adr x1, stringify_active
    str x2, [x1]
    mov x0, x27
full_string_done:
    ldr x30, [sp, #64]
    ldp x28, x29, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #80
    ret
print_value:
    stp x29, x30, [sp, #-16]!
    bl value_to_string
    bl print_string
    ldp x29, x30, [sp], #16
    ret
.align 3
stringify_active:
    .quad 0
full_bad_length_message:
    .asciz "invalid array length"
full_null_access_message:
    .asciz "cannot access property of null or undefined"

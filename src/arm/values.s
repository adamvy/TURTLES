// Raw strings: u64 byte length at +0, UTF8 bytes at +8, trailing zero.
// Arbitrary bytes are preserved. Length, indexing and charAt decode code points.
// x0 bytes,x1 byte count -> copied string. Embedded zero bytes are valid.
string_from_utf8:
string_new:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    mov x2, #0x10000000
    cmp x1, x2
    b.hs fatal_heap
    add x0, x1, #9
    bl heap_alloc
    str x20, [x0]
    add x1, x0, #8
full_str_copy:
    cbz x20, full_str_end
    ldrb w2, [x19]
    strb w2, [x1]
    add x19, x19, #1
    add x1, x1, #1
    sub x20, x20, #1
    b full_str_copy
full_str_end:
    strb wzr, [x1]
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
string_equal:
    cmp x0, x1
    b.eq full_str_equal_yes
    ldr x2, [x0]
    ldr x3, [x1]
    cmp x2, x3
    b.ne full_str_equal_no
    add x0, x0, #8
    add x1, x1, #8
full_str_equal_loop:
    cbz x2, full_str_equal_yes
    ldrb w3, [x0]
    ldrb w4, [x1]
    cmp w3, w4
    b.ne full_str_equal_no
    add x0, x0, #1
    add x1, x1, #1
    sub x2, x2, #1
    b full_str_equal_loop
full_str_equal_yes:
    mov x0, #1
    ret
full_str_equal_no:
    mov x0, #0
    ret
// UTF8 byte ordering agrees with scalar ordering for valid encodings.
string_compare:
    ldr x2, [x0]
    ldr x3, [x1]
    add x0, x0, #8
    add x1, x1, #8
full_str_compare_loop:
    cbz x2, full_str_compare_a_end
    cbz x3, full_str_compare_greater
    ldrb w4, [x0]
    ldrb w5, [x1]
    cmp w4, w5
    b.lo full_str_compare_less
    b.hi full_str_compare_greater
    add x0, x0, #1
    add x1, x1, #1
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
    ldr x0, [x19]
    ldr x1, [x20]
    adds x0, x0, x1
    b.cs fatal_heap
    adds x0, x0, #9
    b.cs fatal_heap
    bl heap_alloc
    ldr x2, [x19]
    ldr x3, [x20]
    add x1, x2, x3
    str x1, [x0]
    add x1, x0, #8
    add x19, x19, #8
    add x20, x20, #8
full_concat_first:
    cbz x2, full_concat_second
    ldrb w4, [x19]
    strb w4, [x1]
    add x19, x19, #1
    add x1, x1, #1
    sub x2, x2, #1
    b full_concat_first
full_concat_second:
    cbz x3, full_concat_end
    ldrb w4, [x20]
    strb w4, [x1]
    add x20, x20, #1
    add x1, x1, #1
    sub x3, x3, #1
    b full_concat_second
full_concat_end:
    strb wzr, [x1]
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

// x0 pointer < x1 end -> x0 scalar, x1 next pointer. Clobbers x2..x8.
// Malformed UTF8 consumes exactly one byte and yields U+FFFD, like Go's rune decoder.
utf8_decode:
    add x2, x0, #1
    ldrb w3, [x0]
    cmp x3, #128
    b.lo full_decode_ascii
    cmp x3, #0xc2
    b.lo full_decode_invalid
    cmp x3, #0xe0
    b.lo full_decode_two
    cmp x3, #0xf0
    b.lo full_decode_three
    cmp x3, #0xf5
    b.hs full_decode_invalid
    and x4, x3, #7
    mov x6, #3
    mov x7, #0x10000
    b full_decode_continue
full_decode_three:
    and x4, x3, #15
    mov x6, #2
    mov x7, #0x800
    b full_decode_continue
full_decode_two:
    and x4, x3, #31
    mov x6, #1
    mov x7, #128
full_decode_continue:
    mov x5, x2
full_decode_next:
    cmp x5, x1
    b.hs full_decode_invalid
    ldrb w8, [x5]
    and x0, x8, #0xc0
    cmp x0, #0x80
    b.ne full_decode_invalid
    add x5, x5, #1
    lsl x4, x4, #6
    and x8, x8, #63
    orr x4, x4, x8
    sub x6, x6, #1
    cbnz x6, full_decode_next
    cmp x4, x7
    b.lo full_decode_invalid
    mov x0, #0x110000
    cmp x4, x0
    b.hs full_decode_invalid
    mov x0, #0xd800
    cmp x4, x0
    b.lo full_decode_done
    mov x0, #0xe000
    cmp x4, x0
    b.lo full_decode_invalid
full_decode_done:
    mov x0, x4
    mov x1, x5
    ret
full_decode_ascii:
    mov x0, x3
    mov x1, x2
    ret
full_decode_invalid:
    mov x0, #0xfffd
    mov x1, x2
    ret

// x0 pointer,x1 end -> count. Preserves x19..x28, like all string helpers.
utf8_count:
    stp x19, x20, [sp, #-32]!
    stp x21, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    mov x21, #0
full_count_next:
    cmp x19, x20
    b.hs full_count_done
    mov x0, x19
    mov x1, x20
    bl utf8_decode
    mov x19, x1
    add x21, x21, #1
    b full_count_next
full_count_done:
    mov x0, x21
    ldp x21, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
string_point_length:
    ldr x1, [x0]
    add x0, x0, #8
    add x1, x0, x1
    b utf8_count

// x0 string,x1 code-point index -> byte offset, clamped to [0, byte length].
string_point_offset:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    add x19, x0, #8
    ldr x20, [x0]
    add x20, x19, x20
    mov x21, x19
    mov x25, x1
    cmp x25, #0
    b.le full_offset_done
full_offset_next:
    cmp x21, x20
    b.hs full_offset_done
    mov x0, x21
    mov x1, x20
    bl utf8_decode
    mov x21, x1
    sub x25, x25, #1
    cbnz x25, full_offset_next
full_offset_done:
    sub x0, x21, x19
    ldp x29, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #48
    ret
// x0 string,x1 code-point index -> one scalar string, or 0 if missing.
string_point_at:
    cmp x1, #0
    b.lt full_point_missing
    stp x19, x30, [sp, #-16]!
    mov x19, x0
    bl string_point_offset
    ldr x1, [x19]
    cmp x0, x1
    b.hs full_point_at_missing
    add x19, x19, #8
    add x1, x19, x1
    add x0, x19, x0
    bl utf8_decode
    bl string_from_codepoint
    ldp x19, x30, [sp], #16
    ret
full_point_at_missing:
    ldp x19, x30, [sp], #16
full_point_missing:
    mov x0, #0
    ret

// x0 scalar -> UTF8 string. Invalid scalar values become U+FFFD.
string_from_codepoint:
    stp x29, x30, [sp, #-32]!
    cmp x0, #0
    b.lt full_codepoint_invalid
    mov x1, #0x110000
    cmp x0, x1
    b.hs full_codepoint_invalid
    mov x1, #0xd800
    cmp x0, x1
    b.lo full_codepoint_valid
    mov x1, #0xe000
    cmp x0, x1
    b.hs full_codepoint_valid
full_codepoint_invalid:
    mov x0, #0xfffd
full_codepoint_valid:
    add x3, sp, #16
    mov x1, #1
    cmp x0, #128
    b.lo full_codepoint_last
    cmp x0, #0x800
    b.lo full_codepoint_two
    cmp x0, #0x10000
    b.lo full_codepoint_three
    lsr x2, x0, #18
    orr x2, x2, #0xf0
    strb w2, [x3]
    add x3, x3, #1
    add x1, x1, #1
    b full_codepoint_three_tail
full_codepoint_three:
    lsr x2, x0, #12
    orr x2, x2, #0xe0
    b full_codepoint_store_three
full_codepoint_three_tail:
    lsr x2, x0, #12
    and x2, x2, #63
    orr x2, x2, #128
full_codepoint_store_three:
    strb w2, [x3]
    add x3, x3, #1
    add x1, x1, #1
    b full_codepoint_two_tail
full_codepoint_two:
    lsr x2, x0, #6
    orr x2, x2, #0xc0
    b full_codepoint_store_two
full_codepoint_two_tail:
    lsr x2, x0, #6
    and x2, x2, #63
    orr x2, x2, #128
full_codepoint_store_two:
    strb w2, [x3]
    add x3, x3, #1
    add x1, x1, #1
    and x0, x0, #63
    orr x0, x0, #128
full_codepoint_last:
    strb w0, [x3]
    add x0, sp, #16
    bl string_new
    ldp x29, x30, [sp], #32
    ret
print_string:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    ldr x20, [x0]
    add x19, x0, #8
full_print_string_next:
    cbz x20, full_print_string_done
    ldrb w0, [x19]
    bl uart_putc
    add x19, x19, #1
    sub x20, x20, #1
    b full_print_string_next
full_print_string_done:
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

// Control flow and equality interpret raw words without a type tag.
value_truthy:
    cmp x0, #0
    cset x0, ne
    ret
value_equal:
    cmp x0, x1
    cset x0, eq
    ret

// Arrays: u64 length, u64 capacity, pointer to raw word storage. No properties.
// x0 length -> x0 array; all elements start at zero.
array_new:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x1, #0x0fffffff
    cmp x19, x1
    b.hi full_array_bad_length
    mov x0, #24
    bl heap_alloc
    mov x20, x0
    str x19, [x20]
    str x19, [x20, #8]
    lsl x0, x19, #3
    bl arena_alloc
    str x0, [x20, #16]
full_array_init:
    cbz x19, full_array_init_done
    str xzr, [x0]
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

// x0 array,x1 index -> x0 array. Grow checked; old backing is not collected.
array_ensure:
    stp x19, x20, [sp, #-48]!
    stp x21, x25, [sp, #16]
    stp x29, x30, [sp, #32]
    mov x19, x0
    mov x2, #0x0ffffffe
    cmp x1, x2
    b.hi full_array_bad_length
    add x20, x1, #1
    ldr x2, [x19]
    cmp x20, x2
    b.ls full_array_ensure_done
    ldr x21, [x19, #8]
    cmp x20, x21
    b.ls full_array_set_length
    lsl x21, x21, #1
    cmp x21, x20
    csel x21, x21, x20, hs
    mov x1, #0x0fffffff
    cmp x21, x1
    csel x21, x21, x20, ls
    lsl x0, x21, #3
    bl arena_alloc
    ldr x2, [x19, #16]
    ldr x3, [x19]
    str x0, [x19, #16]
    str x21, [x19, #8]
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
    cbz x21, full_array_set_length
    str xzr, [x0]
    add x0, x0, #8
    sub x21, x21, #1
    b full_array_grow_fill
full_array_set_length:
    str x20, [x19]
full_array_ensure_done:
    mov x0, x19
    ldp x29, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #48
    ret
// x0 array,x1 element -> x0 array.
array_append:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    ldr x1, [x0]
    bl array_ensure
    ldr x1, [x19]
    sub x1, x1, #1
    ldr x2, [x19, #16]
    str x20, [x2, x1, lsl #3]
    mov x0, x19
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
// x0 array,x1 index -> element, or zero if the index is out of bounds.
array_get:
    ldr x2, [x0]
    cmp x1, x2
    b.hs full_array_get_missing
    ldr x2, [x0, #16]
    ldr x0, [x2, x1, lsl #3]
    ret
full_array_get_missing:
    mov x0, #0
    ret
// x0 array,x1 index,x2 element -> x0 array.
array_set:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x1
    mov x20, x2
    bl array_ensure
    ldr x1, [x0, #16]
    str x20, [x1, x19, lsl #3]
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

// Display a signed integer. Strings have their separate print_string operation.
print_value:
    stp x29, x30, [sp, #-16]!
    bl word_format
    bl print_string
    ldp x29, x30, [sp], #16
    ret
full_bad_length_message:
    .asciz "array length or index out of range"
.align 3

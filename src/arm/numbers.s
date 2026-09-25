// Signed 64-bit decimal words. Parsing/formatting never boxes a number.
// x0 string -> x0 word, x1 success. The entire string must be an integer.
word_parse:
    ldr x2, [x0]
    add x3, x0, #8
    mov x0, #0
    mov x4, #0
    cbz x2, word_parse_bad
    ldrb w5, [x3]
    cmp x5, #45
    b.eq word_parse_negative
    cmp x5, #43
    b.ne word_parse_digits
    b word_parse_sign
word_parse_negative:
    mov x4, #1
word_parse_sign:
    add x3, x3, #1
    sub x2, x2, #1
    cbz x2, word_parse_bad
word_parse_digits:
    mov x6, #922337203685477580
    mov x7, #7
    add x7, x7, x4
    mov x8, #10
word_parse_next:
    ldrb w5, [x3]
    sub x5, x5, #48
    cmp x5, #9
    b.hi word_parse_bad
    cmp x0, x6
    b.hi word_parse_bad
    b.lo word_parse_accumulate
    cmp x5, x7
    b.hi word_parse_bad
word_parse_accumulate:
    madd x0, x0, x8, x5
    add x3, x3, #1
    sub x2, x2, #1
    cbnz x2, word_parse_next
    cbz x4, word_parse_good
    neg x0, x0
word_parse_good:
    mov x1, #1
    ret
word_parse_bad:
    mov x0, #0
    mov x1, #0
    ret

// x0 word -> x0 decimal string. The minimum signed word uses unsigned magnitude.
word_format:
    stp x29, x30, [sp, #-64]!
    add x2, sp, #64
    mov x3, x2
    mov x4, #0
    cmp x0, #0
    b.ge word_format_magnitude
    mov x4, #1
    neg x0, x0
word_format_magnitude:
    mov x5, #10
word_format_digit:
    udiv x6, x0, x5
    msub x7, x6, x5, x0
    add x7, x7, #48
    sub x3, x3, #1
    strb w7, [x3]
    mov x0, x6
    cbnz x0, word_format_digit
    cbz x4, word_format_copy
    sub x3, x3, #1
    mov x7, #45
    strb w7, [x3]
word_format_copy:
    sub x1, x2, x3
    mov x0, x3
    bl string_new
    ldp x29, x30, [sp], #64
    ret

// Native binary64 support. Original implementation, no C or host calls.
// Decimal conversions use bounded exact integer arithmetic and round-to-nearest,
// ties-to-even. Binary64 rounding boundaries need at most 1,075 fractional
// decimal digits; 1,150 significant digits plus a sticky bit are sufficient.
// Big integers: length u64 at +0, little-endian u32 limbs at +8; 256 limbs.

// Small internal leaf helpers use only x0..x18.
num_bn_set:
    str xzr, [x0]
    cbz x1, num_bn_set_done
    str w1, [x0, #8]
    lsr x2, x1, #32
    mov x3, #1
    cbz x2, num_bn_set_len
    str w2, [x0, #12]
    mov x3, #2
num_bn_set_len:
    str x3, [x0]
num_bn_set_done:
    ret
num_bn_copy:
    ldr x2, [x1]
    str x2, [x0]
    mov x3, #0
num_bn_copy_loop:
    cmp x3, x2
    b.hs num_bn_copy_done
    add x4, x1, #8
    ldr w5, [x4, x3, lsl #2]
    add x4, x0, #8
    str w5, [x4, x3, lsl #2]
    add x3, x3, #1
    b num_bn_copy_loop
num_bn_copy_done:
    ret
// x0 *= x1 (u32); add x2 (u32).
num_bn_muladd:
    ldr x3, [x0]
    add x4, x0, #8
    mov x5, #0
num_bn_mul_loop:
    cmp x5, x3
    b.hs num_bn_mul_end
    ldr w6, [x4, x5, lsl #2]
    madd x6, x6, x1, x2
    str w6, [x4, x5, lsl #2]
    lsr x2, x6, #32
    add x5, x5, #1
    b num_bn_mul_loop
num_bn_mul_end:
    cbz x2, num_bn_mul_done
    str w2, [x4, x3, lsl #2]
    add x3, x3, #1
    str x3, [x0]
num_bn_mul_done:
    ret
// x0 <<= x1 bits; no overlap allocation, fixed 256-limb capacity.
num_bn_shl:
    ldr x2, [x0]
    cbz x2, num_bn_shl_done
    cbz x1, num_bn_shl_done
    lsr x3, x1, #5
    and x4, x1, #31
    add x5, x0, #8
    mov x6, x2
num_bn_shl_words:
    cbz x6, num_bn_shl_zero
    sub x6, x6, #1
    ldr w7, [x5, x6, lsl #2]
    add x8, x6, x3
    str w7, [x5, x8, lsl #2]
    b num_bn_shl_words
num_bn_shl_zero:
    mov x6, #0
num_bn_shl_zero_loop:
    cmp x6, x3
    b.hs num_bn_shl_bits
    str wzr, [x5, x6, lsl #2]
    add x6, x6, #1
    b num_bn_shl_zero_loop
num_bn_shl_bits:
    add x2, x2, x3
    mov x6, x3
    mov x7, #0
    cbz x4, num_bn_shl_end
num_bn_shl_bits_loop:
    cmp x6, x2
    b.hs num_bn_shl_carry
    ldr w8, [x5, x6, lsl #2]
    lsl x8, x8, x4
    orr x8, x8, x7
    str w8, [x5, x6, lsl #2]
    lsr x7, x8, #32
    add x6, x6, #1
    b num_bn_shl_bits_loop
num_bn_shl_carry:
    cbz x7, num_bn_shl_end
    str w7, [x5, x2, lsl #2]
    add x2, x2, #1
num_bn_shl_end:
    str x2, [x0]
num_bn_shl_done:
    ret
num_bn_shr1:
    ldr x1, [x0]
    mov x2, x1
    add x3, x0, #8
    mov x4, #0
num_bn_shr_loop:
    cbz x2, num_bn_shr_end
    sub x2, x2, #1
    ldr w5, [x3, x2, lsl #2]
    and x6, x5, #1
    lsr x5, x5, #1
    orr x5, x5, x4
    str w5, [x3, x2, lsl #2]
    lsl x4, x6, #31
    b num_bn_shr_loop
num_bn_shr_end:
    cbz x1, num_bn_shr_done
    sub x2, x1, #1
    ldr w3, [x3, x2, lsl #2]
    cbnz x3, num_bn_shr_done
    str x2, [x0]
num_bn_shr_done:
    ret
// Compare, return signed -1/0/1.
num_bn_cmp:
    ldr x2, [x0]
    ldr x3, [x1]
    cmp x2, x3
    b.lo num_bn_cmp_less
    b.hi num_bn_cmp_more
    add x4, x0, #8
    add x5, x1, #8
num_bn_cmp_loop:
    cbz x2, num_bn_cmp_equal
    sub x2, x2, #1
    ldr w6, [x4, x2, lsl #2]
    ldr w7, [x5, x2, lsl #2]
    cmp w6, w7
    b.lo num_bn_cmp_less
    b.hi num_bn_cmp_more
    b num_bn_cmp_loop
num_bn_cmp_equal:
    mov x0, #0
    ret
num_bn_cmp_less:
    mov x0, #-1
    ret
num_bn_cmp_more:
    mov x0, #1
    ret
// x0 -= x1, requires x0>=x1.
num_bn_sub:
    ldr x2, [x0]
    ldr x3, [x1]
    add x4, x0, #8
    add x5, x1, #8
    mov x6, #0
    mov x7, #0
num_bn_sub_loop:
    cmp x6, x2
    b.hs num_bn_sub_trim
    mov x8, #0
    cmp x6, x3
    b.hs num_bn_sub_no_rhs
    ldr w8, [x5, x6, lsl #2]
num_bn_sub_no_rhs:
    add x8, x8, x7
    ldr w9, [x4, x6, lsl #2]
    cmp x9, x8
    cset x7, lo
    sub x9, x9, x8
    str w9, [x4, x6, lsl #2]
    add x6, x6, #1
    b num_bn_sub_loop
num_bn_sub_trim:
    cbz x2, num_bn_sub_end
    sub x6, x2, #1
    ldr w7, [x4, x6, lsl #2]
    cbnz x7, num_bn_sub_end
    mov x2, x6
    b num_bn_sub_trim
num_bn_sub_end:
    str x2, [x0]
    ret
num_bn_bitlen:
    ldr x1, [x0]
    cbz x1, num_bn_bitlen_zero
    sub x1, x1, #1
    add x2, x0, #8
    ldr w2, [x2, x1, lsl #2]
    lsl x0, x1, #5
num_bn_bitlen_loop:
    cbz x2, num_bn_bitlen_done
    add x0, x0, #1
    lsr x2, x2, #1
    b num_bn_bitlen_loop
num_bn_bitlen_zero:
    mov x0, #0
num_bn_bitlen_done:
    ret
// Divide by small x1; return remainder x0, mutate integer pointed by old x0.
num_bn_divsmall:
    mov x2, x0
    ldr x3, [x2]
    mov x4, x3
    add x5, x2, #8
    mov x0, #0
num_bn_divsmall_loop:
    cbz x4, num_bn_divsmall_end
    sub x4, x4, #1
    ldr w6, [x5, x4, lsl #2]
    lsl x0, x0, #32
    orr x0, x0, x6
    udiv x6, x0, x1
    msub x0, x6, x1, x0
    str w6, [x5, x4, lsl #2]
    b num_bn_divsmall_loop
num_bn_divsmall_end:
    cbz x3, num_bn_divsmall_done
    sub x4, x3, #1
    ldr w5, [x5, x4, lsl #2]
    cbnz x5, num_bn_divsmall_done
    str x4, [x2]
num_bn_divsmall_done:
    ret

// ECMAScript WhiteSpace + LineTerminator UTF16 set.
num_is_space:
    cmp x0, #32
    b.eq num_space_yes
    cmp x0, #9
    b.lo num_space_more
    cmp x0, #13
    b.ls num_space_yes
num_space_more:
    cmp x0, #160
    b.eq num_space_yes
    mov x1, #0x1680
    cmp x0, x1
    b.eq num_space_yes
    mov x1, #0x2000
    cmp x0, x1
    b.lo num_space_other
    mov x1, #0x200a
    cmp x0, x1
    b.ls num_space_yes
num_space_other:
    mov x1, #0x2028
    cmp x0, x1
    b.eq num_space_yes
    add x1, x1, #1
    cmp x0, x1
    b.eq num_space_yes
    mov x1, #0x202f
    cmp x0, x1
    b.eq num_space_yes
    mov x1, #0x205f
    cmp x0, x1
    b.eq num_space_yes
    mov x1, #0x3000
    cmp x0, x1
    b.eq num_space_yes
    mov x1, #0xfeff
    cmp x0, x1
    b.eq num_space_yes
    mov x0, #0
    ret
num_space_yes:
    mov x0, #1
    ret

// Parser scratch: three 1,040-byte bigints; metadata at +3,120.
// All scratch is reclaimed on return, never allocated from the guest heaps.
number_parse:
    stp x29, x30, [sp, #-16]!
    stp x19, x20, [sp, #-16]!
    stp x21, x25, [sp, #-16]!
    stp x26, x27, [sp, #-16]!
    str x28, [sp, #-16]!
    sub sp, sp, #3328
    mov x19, sp
    add x20, x19, #1040
    add x21, x20, #1040
    add x25, x0, #16
    ldr x26, [x0, #8]
    mov x27, #0
    mov x28, #0
    str x1, [sp, #3120]
    str xzr, [sp, #3128] // sign
    str xzr, [sp, #3136] // fractional digit count
    str xzr, [sp, #3144] // kept significant count
    str xzr, [sp, #3152] // dropped count
    str xzr, [sp, #3160] // sticky
    str xzr, [sp, #3168] // digit seen
    str xzr, [sp, #3176] // dot seen
    str xzr, [sp, #3184] // exponent
    mov x0, x19
    mov x1, #0
    bl num_bn_set
num_parse_ws:
    cmp x27, x26
    b.hs num_parse_empty
    ldrh w0, [x25, x27, lsl #1]
    bl num_is_space
    cbz x0, num_parse_sign
    add x27, x27, #1
    b num_parse_ws
num_parse_empty:
    ldr x0, [sp, #3120]
    cbz x0, num_parse_nan
    b num_parse_zero
num_parse_sign:
    ldrh w0, [x25, x27, lsl #1]
    cmp w0, #45
    b.ne num_parse_plus
    mov x1, #1
    str x1, [sp, #3128]
    mov x28, #1
    add x27, x27, #1
    b num_parse_special
num_parse_plus:
    cmp w0, #43
    b.ne num_parse_special
    mov x28, #1
    add x27, x27, #1
num_parse_special:
    // Infinity is the only named numeric prefix.
    mov x2, x27
    adr x3, num_infinity_ascii
    mov x4, #0
num_parse_inf_loop:
    cmp x4, #8
    b.eq num_parse_inf_found
    cmp x2, x26
    b.hs num_parse_radix
    ldrh w5, [x25, x2, lsl #1]
    ldrb w6, [x3, x4]
    cmp w5, w6
    b.ne num_parse_radix
    add x4, x4, #1
    add x2, x2, #1
    b num_parse_inf_loop
num_parse_inf_found:
    mov x27, x2
    mov x28, #1
    b num_parse_validate
num_parse_radix:
    ldr x0, [sp, #3120]
    cbz x0, num_parse_decimal
    cbnz x28, num_parse_decimal
    add x0, x27, #2
    cmp x0, x26
    b.hi num_parse_decimal
    ldrh w0, [x25, x27, lsl #1]
    cmp w0, #48
    b.ne num_parse_decimal
    add x0, x27, #1
    ldrh w0, [x25, x0, lsl #1]
    orr w0, w0, #32
    mov x28, #16
    cmp w0, #120
    b.eq num_parse_radix_start
    mov x28, #2
    cmp w0, #98
    b.eq num_parse_radix_start
    mov x28, #8
    cmp w0, #111
    b.eq num_parse_radix_start
    b num_parse_decimal
num_parse_radix_start:
    add x27, x27, #2
    mov x0, #0
    str x0, [sp, #3192]
num_parse_radix_loop:
    cmp x27, x26
    b.hs num_parse_radix_end
    ldrh w2, [x25, x27, lsl #1]
    sub x2, x2, #48
    cmp x2, #9
    b.ls num_parse_radix_digit
    sub x2, x2, #17
    cmp x2, #5
    b.ls num_parse_radix_letter
    sub x2, x2, #32
    cmp x2, #5
    b.hi num_parse_radix_end
num_parse_radix_letter:
    add x2, x2, #10
num_parse_radix_digit:
    cmp x2, x28
    b.hs num_parse_radix_end
    ldr x0, [sp, #3192]
    add x0, x0, #1
    str x0, [sp, #3192]
    // Stop growing once definitely > binary64 range, still validate suffix.
    ldr x0, [x19]
    cmp x0, #34
    b.hs num_parse_radix_next
    mov x0, x19
    mov x1, x28
    bl num_bn_muladd
num_parse_radix_next:
    add x27, x27, #1
    b num_parse_radix_loop
num_parse_radix_end:
    ldr x0, [sp, #3192]
    cbz x0, num_parse_nan
    mov x28, #2
    b num_parse_validate
num_parse_decimal:
    mov x28, #0
num_parse_decimal_loop:
    cmp x27, x26
    b.hs num_parse_decimal_end
    ldrh w2, [x25, x27, lsl #1]
    cmp w2, #46
    b.ne num_parse_decimal_digit
    ldr x0, [sp, #3176]
    cbnz x0, num_parse_decimal_end
    mov x0, #1
    str x0, [sp, #3176]
    add x27, x27, #1
    b num_parse_decimal_loop
num_parse_decimal_digit:
    sub x2, x2, #48
    cmp x2, #9
    b.hi num_parse_decimal_end
    mov x0, #1
    str x0, [sp, #3168]
    ldr x0, [sp, #3176]
    ldr x1, [sp, #3136]
    add x1, x1, x0
    str x1, [sp, #3136]
    ldr x0, [sp, #3144]
    cbnz x0, num_parse_keep_digit
    cbz x2, num_parse_decimal_next
num_parse_keep_digit:
    cmp x0, #1150
    b.hs num_parse_drop_digit
    add x0, x0, #1
    str x0, [sp, #3144]
    mov x0, x19
    mov x1, #10
    bl num_bn_muladd
    b num_parse_decimal_next
num_parse_drop_digit:
    ldr x0, [sp, #3152]
    add x0, x0, #1
    str x0, [sp, #3152]
    cbz x2, num_parse_decimal_next
    mov x0, #1
    str x0, [sp, #3160]
num_parse_decimal_next:
    add x27, x27, #1
    b num_parse_decimal_loop
num_parse_decimal_end:
    ldr x0, [sp, #3168]
    cbz x0, num_parse_nan
    cmp x27, x26
    b.hs num_parse_validate
    ldrh w0, [x25, x27, lsl #1]
    orr w0, w0, #32
    cmp w0, #101
    b.ne num_parse_validate
    mov x6, x27
    add x27, x27, #1
    mov x7, #0
    mov x8, #0
    mov x9, #0
    cmp x27, x26
    b.hs num_parse_exp_rollback
    ldrh w0, [x25, x27, lsl #1]
    cmp w0, #45
    b.ne num_parse_exp_plus
    mov x7, #1
    add x27, x27, #1
    b num_parse_exp_loop
num_parse_exp_plus:
    cmp w0, #43
    b.ne num_parse_exp_loop
    add x27, x27, #1
num_parse_exp_loop:
    cmp x27, x26
    b.hs num_parse_exp_end
    ldrh w0, [x25, x27, lsl #1]
    sub x0, x0, #48
    cmp x0, #9
    b.hi num_parse_exp_end
    mov x9, #1
    mov x1, #1000000000
    cmp x8, x1
    b.hs num_parse_exp_next
    mov x1, #10
    madd x8, x8, x1, x0
num_parse_exp_next:
    add x27, x27, #1
    b num_parse_exp_loop
num_parse_exp_end:
    cbz x9, num_parse_exp_rollback
    cbz x7, num_parse_exp_save
    neg x8, x8
num_parse_exp_save:
    str x8, [sp, #3184]
    b num_parse_validate
num_parse_exp_rollback:
    mov x27, x6
num_parse_validate:
    ldr x0, [sp, #3120]
    cbz x0, num_parse_valid
num_parse_validate_loop:
    cmp x27, x26
    b.hs num_parse_valid
    ldrh w0, [x25, x27, lsl #1]
    bl num_is_space
    cbz x0, num_parse_nan
    add x27, x27, #1
    b num_parse_validate_loop
num_parse_valid:
    cmp x28, #1
    b.eq num_parse_infinity
    cmp x28, #2
    b.eq num_parse_radix_den
    ldr x0, [x19]
    cbz x0, num_parse_zero
    ldr x0, [sp, #3184]
    ldr x1, [sp, #3136]
    sub x28, x0, x1
    ldr x0, [sp, #3152]
    add x28, x28, x0
    ldr x0, [sp, #3144]
    add x0, x0, x28
    cmp x0, #310
    b.ge num_parse_infinity
    mov x1, #-324
    cmp x0, x1
    b.lt num_parse_zero
    b num_parse_den_init
num_parse_radix_den:
    mov x28, #0
num_parse_den_init:
    mov x0, x20
    mov x1, #1
    bl num_bn_set
    cmp x28, #0
    b.lt num_parse_den_pow
num_parse_num_pow:
    cbz x28, num_parse_ratio
    mov x0, x19
    mov x1, #10
    mov x2, #0
    bl num_bn_muladd
    sub x28, x28, #1
    b num_parse_num_pow
num_parse_den_pow:
    mov x0, x20
    mov x1, #10
    mov x2, #0
    bl num_bn_muladd
    add x28, x28, #1
    cbnz x28, num_parse_den_pow
num_parse_ratio:
    ldr x0, [x19]
    cbz x0, num_parse_zero
    mov x0, x19
    bl num_bn_bitlen
    mov x27, x0
    mov x0, x20
    bl num_bn_bitlen
    sub x27, x27, x0
    // Determine exact floor(log2(N/D)).
    cmp x27, #0
    b.lt num_parse_compare_negative
    mov x0, x21
    mov x1, x20
    bl num_bn_copy
    mov x0, x21
    mov x1, x27
    bl num_bn_shl
    mov x0, x19
    mov x1, x21
    bl num_bn_cmp
    b num_parse_compare_done
num_parse_compare_negative:
    mov x0, x21
    mov x1, x19
    bl num_bn_copy
    mov x0, x21
    neg x1, x27
    bl num_bn_shl
    mov x0, x21
    mov x1, x20
    bl num_bn_cmp
num_parse_compare_done:
    cmp x0, #0
    b.ge num_parse_have_exp
    sub x27, x27, #1
num_parse_have_exp:
    cmp x27, #1023
    b.gt num_parse_infinity
    sub x28, x27, #52
    mov x0, #-1074
    cmp x28, x0
    csel x28, x28, x0, ge
    cmp x28, #0
    b.lt num_parse_shift_num
    mov x0, x20
    mov x1, x28
    bl num_bn_shl
    b num_parse_divide
num_parse_shift_num:
    mov x0, x19
    neg x1, x28
    bl num_bn_shl
num_parse_divide:
    mov x0, x21
    mov x1, x20
    bl num_bn_copy
    mov x0, x21
    mov x1, #53
    bl num_bn_shl
    mov x25, #53
    mov x26, #0
num_parse_div_loop:
    mov x0, x19
    mov x1, x21
    bl num_bn_cmp
    cmp x0, #0
    b.lt num_parse_div_skip
    mov x0, x19
    mov x1, x21
    bl num_bn_sub
    mov x0, #1
    lsl x0, x0, x25
    orr x26, x26, x0
num_parse_div_skip:
    cbz x25, num_parse_round
    mov x0, x21
    bl num_bn_shr1
    sub x25, x25, #1
    b num_parse_div_loop
num_parse_round:
    mov x0, x19
    mov x1, #1
    bl num_bn_shl
    mov x0, x19
    mov x1, x20
    bl num_bn_cmp
    cmp x0, #0
    b.gt num_parse_round_up
    b.lt num_parse_pack
    ldr x0, [sp, #3160]
    cbnz x0, num_parse_round_up
    tbz x26, #0, num_parse_pack
num_parse_round_up:
    add x26, x26, #1
num_parse_pack:
    // Result = exact integer quotient * 2^unitExponent. Construct bits.
    cbz x26, num_parse_zero
    mov x0, #0x20000000000000
    cmp x26, x0
    b.lo num_parse_pack_normal
    lsr x26, x26, #1
    add x28, x28, #1
num_parse_pack_normal:
    mov x0, #0x10000000000000
    cmp x26, x0
    b.lo num_parse_pack_subnormal
    add x0, x28, #1075
    cmp x0, #2047
    b.ge num_parse_infinity
    lsl x0, x0, #52
    and x26, x26, #0xfffffffffffff
    orr x0, x0, x26
    b num_parse_signed
num_parse_pack_subnormal:
    mov x0, x26
    b num_parse_signed
num_parse_nan:
    mov x0, #0x7ff8000000000000
    b num_parse_return
num_parse_zero:
    mov x0, #0
    b num_parse_signed
num_parse_infinity:
    mov x0, #0x7ff0000000000000
num_parse_signed:
    ldr x1, [sp, #3128]
    lsl x1, x1, #63
    orr x0, x0, x1
num_parse_return:
    fmov d0, x0
    add sp, sp, #3328
    ldr x28, [sp], #16
    ldp x26, x27, [sp], #16
    ldp x21, x25, [sp], #16
    ldp x19, x20, [sp], #16
    ldp x29, x30, [sp], #16
    ret
num_infinity_ascii:
    .ascii "Infinity"
.align 2

// Exact decimal expansion followed by shortest-roundtrip candidate search.
// Ties among equally close decimal candidates use an even final digit.
number_format:
    stp x29, x30, [sp, #-16]!
    stp x19, x20, [sp, #-16]!
    stp x21, x25, [sp, #-16]!
    stp x26, x27, [sp, #-16]!
    str x28, [sp, #-16]!
    sub sp, sp, #4096
    mov x19, sp
    add x20, sp, #1040
    fmov x21, d0
    lsr x0, x21, #63
    str x0, [sp, #3904]
    and x21, x21, #0x7fffffffffffffff
    mov x0, #0x7ff0000000000000
    cmp x21, x0
    b.hi num_format_nan
    b.eq num_format_infinity
    cbz x21, num_format_zero
    lsr x0, x21, #52
    and x1, x21, #0xfffffffffffff
    cbz x0, num_format_subnormal
    orr x1, x1, #0x10000000000000
    sub x25, x0, #1075
    b num_format_integer
num_format_subnormal:
    mov x25, #-1074
num_format_integer:
    mov x0, x19
    bl num_bn_set
    str xzr, [sp, #3912]
    cmp x25, #0
    b.lt num_format_fraction
    mov x0, x19
    mov x1, x25
    bl num_bn_shl
    b num_format_expand
num_format_fraction:
    neg x25, x25
    str x25, [sp, #3912]
num_format_five_loop:
    mov x0, x19
    mov x1, #5
    mov x2, #0
    bl num_bn_muladd
    sub x25, x25, #1
    cbnz x25, num_format_five_loop
num_format_expand:
    mov x25, #0
num_format_decimal_loop:
    mov x0, x19
    mov x1, #10
    bl num_bn_divsmall
    add x0, x0, #48
    strb w0, [x20, x25]
    add x25, x25, #1
    ldr x0, [x19]
    cbnz x0, num_format_decimal_loop
    // Reverse decimal digits in place.
    mov x0, #0
    sub x1, x25, #1
num_format_reverse:
    cmp x0, x1
    b.hs num_format_search
    ldrb w2, [x20, x0]
    ldrb w3, [x20, x1]
    strb w3, [x20, x0]
    strb w2, [x20, x1]
    add x0, x0, #1
    sub x1, x1, #1
    b num_format_reverse
num_format_search:
    ldr x0, [sp, #3912]
    sub x26, x25, x0 // decimal-point position
    mov x27, #1
num_format_precision:
    mov x28, #0
    mov x0, #0
    mov x2, #10
num_format_prefix_loop:
    cmp x0, x27
    b.hs num_format_round_candidate
    mov x1, #0
    cmp x0, x25
    b.hs num_format_prefix_digit
    ldrb w1, [x20, x0]
    sub x1, x1, #48
num_format_prefix_digit:
    madd x28, x28, x2, x1
    add x0, x0, #1
    b num_format_prefix_loop
num_format_round_candidate:
    cmp x27, x25
    b.hs num_format_candidate_ready
    ldrb w0, [x20, x27]
    cmp w0, #53
    b.hi num_format_candidate_up
    b.lo num_format_candidate_ready
    add x0, x27, #1
num_format_round_tail:
    cmp x0, x25
    b.hs num_format_round_even
    ldrb w1, [x20, x0]
    cmp w1, #48
    b.ne num_format_candidate_up
    add x0, x0, #1
    b num_format_round_tail
num_format_round_even:
    tbz x28, #0, num_format_candidate_ready
num_format_candidate_up:
    add x28, x28, #1
num_format_candidate_ready:
    sub x0, x26, x27
    str x0, [sp, #3920] // decimal coefficient exponent
    str x28, [sp, #3928] // nearest coefficient
    str xzr, [sp, #3936] // candidate stage
num_format_try_candidate:
    // Form <coefficient>e<signed exponent> in UTF16 scratch object.
    add x0, sp, #3456
    mov x1, #1
    str x1, [x0]
    add x5, sp, #2080
    mov x1, x28
    mov x2, #10
    mov x3, #0
num_format_coeff_digits:
    udiv x4, x1, x2
    msub x6, x4, x2, x1
    add x6, x6, #48
    strb w6, [x5, x3]
    add x3, x3, #1
    mov x1, x4
    cbnz x1, num_format_coeff_digits
    add x6, x0, #16
    mov x7, #0
num_format_coeff_copy:
    sub x3, x3, #1
    ldrb w1, [x5, x3]
    strh w1, [x6, x7, lsl #1]
    add x7, x7, #1
    cbnz x3, num_format_coeff_copy
    mov x1, #101
    strh w1, [x6, x7, lsl #1]
    add x7, x7, #1
    ldr x1, [sp, #3920]
    cmp x1, #0
    b.ge num_format_exp_abs
    mov x2, #45
    strh w2, [x6, x7, lsl #1]
    add x7, x7, #1
    neg x1, x1
num_format_exp_abs:
    mov x2, #10
    mov x3, #0
num_format_exp_digits:
    udiv x4, x1, x2
    msub x8, x4, x2, x1
    add x8, x8, #48
    strb w8, [x5, x3]
    add x3, x3, #1
    mov x1, x4
    cbnz x1, num_format_exp_digits
num_format_exp_copy:
    sub x3, x3, #1
    ldrb w1, [x5, x3]
    strh w1, [x6, x7, lsl #1]
    add x7, x7, #1
    cbnz x3, num_format_exp_copy
    str x7, [x0, #8]
    mov x1, #1
    bl number_parse
    fmov x0, d0
    cmp x0, x21
    b.eq num_format_found
    ldr x0, [sp, #3936]
    add x0, x0, #1
    str x0, [sp, #3936]
    ldr x28, [sp, #3928]
    cmp x0, #1
    b.ne num_format_try_upper
    sub x28, x28, #1
    b num_format_try_candidate
num_format_try_upper:
    cmp x0, #2
    b.ne num_format_next_precision
    add x28, x28, #1
    b num_format_try_candidate
num_format_next_precision:
    add x27, x27, #1
    cmp x27, #17
    b.ls num_format_precision
    // A 17-digit nearest decimal always roundtrips for binary64.
    // Reaching this indicates an implementation error, never truncate silently.
    adr x0, num_conversion_error
    bl runtime_error
num_format_found:
    // Strip trailing coefficient zeros, keeping the same decimal value.
    ldr x26, [sp, #3920]
    mov x2, #10
num_format_strip:
    udiv x0, x28, x2
    msub x1, x0, x2, x28
    cbnz x1, num_format_final_digits
    mov x28, x0
    add x26, x26, #1
    b num_format_strip
num_format_final_digits:
    add x20, sp, #2080
    mov x25, #0
num_format_final_digit_loop:
    udiv x0, x28, x2
    msub x1, x0, x2, x28
    add x1, x1, #48
    strb w1, [x20, x25]
    add x25, x25, #1
    mov x28, x0
    cbnz x28, num_format_final_digit_loop
    add x26, x26, x25 // n: final decimal-point position
    add x19, sp, #3600
    mov x27, #0
    ldr x0, [sp, #3904]
    cbz x0, num_format_choose
    mov x0, #45
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
num_format_choose:
    cmp x26, #0
    b.le num_format_small
    cmp x26, #21
    b.gt num_format_scientific
    mov x28, #0
num_format_fixed_loop:
    cmp x28, x25
    b.hs num_format_fixed_zeroes
    cmp x28, x26
    b.ne num_format_fixed_digit
    mov x0, #46
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
num_format_fixed_digit:
    sub x0, x25, x28
    sub x0, x0, #1
    ldrb w0, [x20, x0]
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    add x28, x28, #1
    b num_format_fixed_loop
num_format_fixed_zeroes:
    cmp x28, x26
    b.ge num_format_finish
    mov x0, #48
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    add x28, x28, #1
    b num_format_fixed_zeroes
num_format_small:
    mov x0, #-6
    cmp x26, x0
    b.le num_format_scientific
    mov x0, #48
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    mov x0, #46
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
num_format_leading_zeroes:
    cbz x26, num_format_fraction_digits
    mov x0, #48
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    add x26, x26, #1
    b num_format_leading_zeroes
num_format_fraction_digits:
    sub x25, x25, #1
    ldrb w0, [x20, x25]
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    cbnz x25, num_format_fraction_digits
    b num_format_finish
num_format_scientific:
    sub x25, x25, #1
    ldrb w0, [x20, x25]
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    cbz x25, num_format_scientific_exp
    mov x0, #46
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
num_format_scientific_digits:
    sub x25, x25, #1
    ldrb w0, [x20, x25]
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    cbnz x25, num_format_scientific_digits
num_format_scientific_exp:
    mov x0, #101
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    sub x26, x26, #1
    mov x0, #43
    cmp x26, #0
    b.ge num_format_scientific_sign
    mov x0, #45
    neg x26, x26
num_format_scientific_sign:
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    mov x25, #0
    mov x2, #10
num_format_scientific_exp_digits:
    udiv x0, x26, x2
    msub x1, x0, x2, x26
    add x1, x1, #48
    strb w1, [x20, x25]
    add x25, x25, #1
    mov x26, x0
    cbnz x26, num_format_scientific_exp_digits
num_format_scientific_exp_copy:
    sub x25, x25, #1
    ldrb w0, [x20, x25]
    strh w0, [x19, x27, lsl #1]
    add x27, x27, #1
    cbnz x25, num_format_scientific_exp_copy
num_format_finish:
    mov x0, x19
    mov x1, x27
    bl string_new
    b num_format_return
num_format_zero:
    add x19, sp, #3600
    mov x0, #48
    strh w0, [x19]
    mov x27, #1
    b num_format_finish
num_format_nan:
    adr x0, num_nan_ascii
    mov x1, #3
    bl string_from_utf8
    b num_format_return
num_format_infinity:
    ldr x0, [sp, #3904]
    cbnz x0, num_format_neg_inf
    adr x0, num_infinity_ascii
    mov x1, #8
    bl string_from_utf8
    b num_format_return
num_format_neg_inf:
    adr x0, num_neg_inf_ascii
    mov x1, #9
    bl string_from_utf8
num_format_return:
    add sp, sp, #4096
    ldr x28, [sp], #16
    ldp x26, x27, [sp], #16
    ldp x21, x25, [sp], #16
    ldp x19, x20, [sp], #16
    ldp x29, x30, [sp], #16
    ret
num_nan_ascii:
    .ascii "NaN"
num_neg_inf_ascii:
    .ascii "-Infinity"
num_conversion_error:
    .asciz "internal decimal conversion error"
.align 2

// Exact binary shift/subtract remainder, following the elementary fmod
// significand algorithm (no division/rounding of a huge floating quotient).
number_mod:
    fmov x0, d0
    fmov x1, d1
    and x2, x0, #0x7fffffffffffffff
    and x3, x1, #0x7fffffffffffffff
    mov x4, #0x7ff0000000000000
    cmp x2, x4
    b.hs num_mod_nan
    cmp x3, x4
    b.hi num_mod_nan
    cbz x3, num_mod_nan
    cmp x2, x3
    b.lo num_mod_return
    b.eq num_mod_zero
    lsr x4, x2, #52
    lsr x5, x3, #52
    and x2, x2, #0xfffffffffffff
    and x3, x3, #0xfffffffffffff
    cbz x4, num_mod_normalize_x
    orr x2, x2, #0x10000000000000
    b num_mod_y
num_mod_normalize_x:
    mov x4, #1
num_mod_normalize_x_loop:
    tbnz x2, #52, num_mod_y
    lsl x2, x2, #1
    sub x4, x4, #1
    b num_mod_normalize_x_loop
num_mod_y:
    cbz x5, num_mod_normalize_y
    orr x3, x3, #0x10000000000000
    b num_mod_loop
num_mod_normalize_y:
    mov x5, #1
num_mod_normalize_y_loop:
    tbnz x3, #52, num_mod_loop
    lsl x3, x3, #1
    sub x5, x5, #1
    b num_mod_normalize_y_loop
num_mod_loop:
    cmp x4, x5
    b.le num_mod_last
    cmp x2, x3
    b.lo num_mod_shift
    sub x2, x2, x3
    cbz x2, num_mod_zero
num_mod_shift:
    lsl x2, x2, #1
    sub x4, x4, #1
    b num_mod_loop
num_mod_last:
    cmp x2, x3
    b.lo num_mod_normalize
    sub x2, x2, x3
    cbz x2, num_mod_zero
num_mod_normalize:
    tbnz x2, #52, num_mod_pack
    lsl x2, x2, #1
    sub x4, x4, #1
    b num_mod_normalize
num_mod_pack:
    cmp x4, #0
    b.le num_mod_subnormal
    and x2, x2, #0xfffffffffffff
    lsl x4, x4, #52
    orr x2, x2, x4
    b num_mod_sign
num_mod_subnormal:
    mov x3, #1
    sub x3, x3, x4
    lsr x2, x2, x3
num_mod_sign:
    and x0, x0, #0x8000000000000000
    orr x0, x0, x2
    fmov d0, x0
num_mod_return:
    ret
num_mod_zero:
    and x0, x0, #0x8000000000000000
    fmov d0, x0
    ret
num_mod_nan:
    mov x0, #0x7ff8000000000000
    fmov d0, x0
    ret

// Double-double arithmetic for log/exp. hi+lo pairs in (d0,d1),(d2,d3).
// Error-free TwoSum and Dekker product, with a final normalization.
num_dd_add:
    fadd d4, d0, d2
    fsub d5, d4, d0
    fsub d6, d4, d5
    fsub d6, d0, d6
    fsub d5, d2, d5
    fadd d6, d6, d5
    fadd d6, d6, d1
    fadd d6, d6, d3
    fadd d0, d4, d6
    fsub d1, d0, d4
    fsub d1, d6, d1
    ret
num_dd_mul:
    sub sp, sp, #64
    stp d0, d1, [sp]
    stp d2, d3, [sp, #16]
    fmul d4, d0, d2
    str d4, [sp, #32]
    mov x0, #0x41a0000002000000 // 2^27+1
    fmov d7, x0
    fmul d4, d0, d7
    fsub d5, d4, d0
    fsub d4, d4, d5 // a_hi
    fsub d5, d0, d4 // a_lo
    fmul d6, d2, d7
    fsub d7, d6, d2
    fsub d6, d6, d7 // b_hi
    fsub d7, d2, d6 // b_lo
    fmul d0, d4, d6
    ldr d1, [sp, #32]
    fsub d0, d0, d1
    fmul d4, d4, d7
    fadd d0, d0, d4
    fmul d6, d5, d6
    fadd d0, d0, d6
    fmul d5, d5, d7
    fadd d0, d0, d5
    ldp d2, d3, [sp]
    ldp d4, d5, [sp, #16]
    fmul d6, d2, d5
    fmul d7, d3, d4
    fadd d0, d0, d6
    fadd d0, d0, d7
    fmul d6, d3, d5
    fadd d0, d0, d6
    fadd d2, d1, d0
    fsub d3, d2, d1
    fsub d1, d0, d3
    fmov d0, d2
    add sp, sp, #64
    ret
num_dd_div:
    stp x29, x30, [sp, #-16]!
    sub sp, sp, #48
    stp d0, d1, [sp]
    stp d2, d3, [sp, #16]
    fdiv d4, d0, d2
    str d4, [sp, #32]
    fmov d0, d2
    fmov d1, d3
    fmov d2, d4
    fmov d3, xzr
    bl num_dd_mul
    fneg d0, d0
    fneg d1, d1
    ldp d2, d3, [sp]
    bl num_dd_add
    ldr d2, [sp, #16]
    fadd d0, d0, d1
    fdiv d1, d0, d2
    ldr d2, [sp, #32]
    fadd d0, d2, d1
    fsub d3, d0, d2
    fsub d1, d1, d3
    add sp, sp, #48
    ldp x29, x30, [sp], #16
    ret

// Math.pow with ECMAScript special cases and double-double log/exp.
// Log uses 2*atanh((m-1)/(m+1)), |argument| <= .171573, 31 terms;
// exp uses range reduction by a double-double ln(2), 40 Taylor terms.
// Math.pow is implementation-approximated in ECMAScript; this implementation
// retains ~100 significant bits internally and rounds the final binary64.
number_pow:
    stp x29, x30, [sp, #-16]!
    stp x19, x20, [sp, #-16]!
    stp x21, x25, [sp, #-16]!
    stp x26, x27, [sp, #-16]!
    str x28, [sp, #-16]!
    sub sp, sp, #192
    fmov x19, d0
    fmov x20, d1
    and x21, x19, #0x7fffffffffffffff
    and x25, x20, #0x7fffffffffffffff
    cbz x25, num_pow_one
    mov x0, #0x7ff0000000000000
    cmp x21, x0
    b.hi num_pow_nan
    cmp x25, x0
    b.hi num_pow_nan
    b.eq num_pow_infinite_y
    mov x28, #0 // result sign
    mov x27, #0 // y is odd integer
    mov x26, #1 // y is an integer
    mov x0, #0x4340000000000000 // 2^53; all larger doubles integral/even
    cmp x25, x0
    b.hs num_pow_integer_known
    fcvtzs x0, d1
    scvtf d2, x0
    fcmp d1, d2
    cset x26, eq
    and x27, x0, #1
    and x27, x27, x26
num_pow_integer_known:
    tbz x19, #63, num_pow_sign_known
    lsl x28, x27, #63
num_pow_sign_known:
    cbz x21, num_pow_zero_base
    mov x0, #0x7ff0000000000000
    cmp x21, x0
    b.eq num_pow_infinite_base
    tbz x19, #63, num_pow_positive_base
    cbz x26, num_pow_nan
num_pow_positive_base:
    mov x0, #0x3ff0000000000000
    cmp x21, x0
    b.eq num_pow_signed_one
    cmp x20, x0
    b.eq num_pow_original
    mov x0, #0xbff0000000000000
    cmp x20, x0
    b.eq num_pow_reciprocal
    mov x0, #0x3fe0000000000000
    cmp x20, x0
    b.eq num_pow_sqrt
    mov x0, #0x4000000000000000
    cmp x20, x0
    b.eq num_pow_square
    mov x0, #0x43e0000000000000 // |y|>=2^63: every |x|!=1 over/underflows.
    cmp x25, x0
    b.hs num_pow_huge_y
    // Normalize |x| to m in [sqrt(.5),sqrt(2)), plus exponent x26.
    fmov d0, x21
    lsr x26, x21, #52
    cbnz x26, num_pow_normal_x
    mov x0, #0x4350000000000000 // 2^54
    fmov d2, x0
    fmul d0, d0, d2
    fmov x21, d0
    lsr x26, x21, #52
    sub x26, x26, #54
num_pow_normal_x:
    sub x26, x26, #1023
    and x0, x21, #0xfffffffffffff
    mov x1, #0x3ff0000000000000
    orr x0, x0, x1
    mov x1, #0x3ff6a09e667f3bcd // sqrt(2)
    cmp x0, x1
    b.lo num_pow_m_ready
    mov x1, #0x10000000000000
    sub x0, x0, x1
    add x26, x26, #1
num_pow_m_ready:
    fmov d0, x0
    mov x0, #0x3ff0000000000000
    fmov d4, x0
    fadd d2, d0, d4
    fsub d3, d2, d4
    fsub d3, d0, d3
    fsub d0, d0, d4
    fmov d1, xzr
    bl num_dd_div
    stp d0, d1, [sp, #32] // t^(odd)
    stp d0, d1, [sp, #48] // sum
    fmov d2, d0
    fmov d3, d1
    bl num_dd_mul
    stp d0, d1, [sp, #16] // t^2
    mov x27, #3
num_pow_log_loop:
    ldp d0, d1, [sp, #32]
    ldp d2, d3, [sp, #16]
    bl num_dd_mul
    stp d0, d1, [sp, #32]
    scvtf d2, x27
    fmov d3, xzr
    bl num_dd_div
    ldp d2, d3, [sp, #48]
    bl num_dd_add
    stp d0, d1, [sp, #48]
    add x27, x27, #2
    cmp x27, #63
    b.ls num_pow_log_loop
    fadd d0, d0, d0
    fadd d1, d1, d1
    stp d0, d1, [sp, #48]
    scvtf d0, x26
    fmov d1, xzr
    mov x0, #0x3fe62e42fefa39ef
    fmov d2, x0
    mov x0, #0x3c7abc9e3b39803f
    fmov d3, x0
    bl num_dd_mul
    ldp d2, d3, [sp, #48]
    bl num_dd_add
    fmov d2, x20
    fmov d3, xzr
    bl num_dd_mul // y*log(x)
    mov x0, #0x4086300000000000 // 710
    fmov d2, x0
    fcmp d0, d2
    b.gt num_pow_signed_inf
    mov x0, #0xc087500000000000 // -746
    fmov d2, x0
    fcmp d0, d2
    b.lt num_pow_signed_zero
    stp d0, d1, [sp, #48]
    mov x0, #0x3ff71547652b82fe // 1/ln(2)
    fmov d2, x0
    fmul d2, d0, d2
    mov x0, #0x3fe0000000000000
    fmov d3, x0
    fcmp d2, #0
    b.ge num_pow_reduce_positive
    fneg d3, d3
num_pow_reduce_positive:
    fadd d2, d2, d3
    fcvtzs x25, d2
    scvtf d0, x25
    fmov d1, xzr
    mov x0, #0x3fe62e42fefa39ef
    fmov d2, x0
    mov x0, #0x3c7abc9e3b39803f
    fmov d3, x0
    bl num_dd_mul
    fneg d0, d0
    fneg d1, d1
    ldp d2, d3, [sp, #48]
    bl num_dd_add
    stp d0, d1, [sp, #16] // reduced r
    mov x0, #0x3ff0000000000000
    fmov d0, x0
    fmov d1, xzr
    stp d0, d1, [sp, #32] // term
    stp d0, d1, [sp, #48] // sum
    mov x27, #1
num_pow_exp_loop:
    ldp d0, d1, [sp, #32]
    ldp d2, d3, [sp, #16]
    bl num_dd_mul
    scvtf d2, x27
    fmov d3, xzr
    bl num_dd_div
    stp d0, d1, [sp, #32]
    ldp d2, d3, [sp, #48]
    bl num_dd_add
    stp d0, d1, [sp, #48]
    add x27, x27, #1
    cmp x27, #40
    b.ls num_pow_exp_loop
    mov x0, #-1022
    cmp x25, x0
    b.le num_pow_subnormal_result
    fadd d0, d0, d1
    cmp x25, #1023
    b.gt num_pow_scale_over
    add x0, x25, #1023
    lsl x0, x0, #52
    fmov d2, x0
    fmul d0, d0, d2
    b num_pow_apply_sign
num_pow_scale_over:
    mov x0, #0x7fe0000000000000
    fmov d2, x0
    fmul d0, d0, d2
    fadd d0, d0, d0
    b num_pow_apply_sign
num_pow_subnormal_result:
    // Round in units of 2^-1074; preserve low part until the integer tie test.
    add x0, x25, #2097
    lsl x0, x0, #52
    fmov d2, x0
    fmul d0, d0, d2
    fmul d1, d1, d2
    fcvtzu x19, d0
    ucvtf d2, x19
    fsub d0, d0, d2
    fmov d2, xzr
    fmov d3, xzr
    bl num_dd_add
    mov x0, #0x3fe0000000000000
    fmov d2, x0
    fcmp d0, d2
    b.gt num_pow_subnormal_up
    b.lt num_pow_subnormal_pack
    fcmp d1, #0
    b.gt num_pow_subnormal_up
    b.lt num_pow_subnormal_pack
    tbz x19, #0, num_pow_subnormal_pack
num_pow_subnormal_up:
    add x19, x19, #1
num_pow_subnormal_pack:
    fmov d0, x19
    b num_pow_apply_sign
num_pow_infinite_y:
    mov x0, #0x3ff0000000000000
    cmp x21, x0
    b.eq num_pow_nan
    cset x0, hi
    lsr x1, x20, #63
    eor x0, x0, x1
    mov x28, #0
    cbnz x0, num_pow_signed_inf
    b num_pow_signed_zero
num_pow_huge_y:
    mov x0, #0x3ff0000000000000
    cmp x21, x0
    cset x0, hi
    lsr x1, x20, #63
    eor x0, x0, x1
    cbnz x0, num_pow_signed_inf
    b num_pow_signed_zero
num_pow_zero_base:
    tbnz x20, #63, num_pow_signed_inf
    b num_pow_signed_zero
num_pow_infinite_base:
    tbnz x20, #63, num_pow_signed_zero
    b num_pow_signed_inf
num_pow_original:
    fmov d0, x19
    b num_pow_return
num_pow_reciprocal:
    mov x0, #0x3ff0000000000000
    fmov d1, x0
    fmov d0, x19
    fdiv d0, d1, d0
    b num_pow_return
num_pow_sqrt:
    fmov d0, x21
    fsqrt d0, d0
    b num_pow_return
num_pow_square:
    fmov d0, x19
    fmul d0, d0, d0
    b num_pow_return
num_pow_nan:
    mov x0, #0x7ff8000000000000
    fmov d0, x0
    b num_pow_return
num_pow_one:
    mov x28, #0
num_pow_signed_one:
    mov x0, #0x3ff0000000000000
    fmov d0, x0
    b num_pow_apply_sign
num_pow_signed_zero:
    fmov d0, xzr
    b num_pow_apply_sign
num_pow_signed_inf:
    mov x0, #0x7ff0000000000000
    fmov d0, x0
num_pow_apply_sign:
    fmov x0, d0
    orr x0, x0, x28
    fmov d0, x0
num_pow_return:
    add sp, sp, #192
    ldr x28, [sp], #16
    ldp x26, x27, [sp], #16
    ldp x21, x25, [sp], #16
    ldp x19, x20, [sp], #16
    ldp x29, x30, [sp], #16
    ret

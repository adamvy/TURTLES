// Guest-resident T0 compiler and linked-instruction VM.
// Binding kinds: 1 native, 2 constant, 3 local, 4 named return, 5 compiler.
// Local modes: 0 read, 1 write, 2 increment, 3 decrement.

core_init:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x0, #32
    bl arena_alloc
    str xzr, [x0]
    str xzr, [x0, #8]
    mov x1, #10
    str x1, [x0, #16]
    str xzr, [x0, #24]
    adr x1, global_scope
    str x0, [x1]
    adr x1, compiler_scope
    str x0, [x1]
    adr x1, current_frame
    str xzr, [x1]
    adr x1, compiler_builder
    str xzr, [x1]
    adr x1, compiler_index
    str xzr, [x1]
    adr x1, compiler_input
    mov x0, #10
    str x0, [x1]
    adr x1, outer_builder
    mov x0, #-1
    str x0, [x1]
    adr x1, throw_pending
    str xzr, [x1]
    adr x1, throw_value
    mov x0, #10
    str x0, [x1]
    adr x19, primitive_table
core_init_primitive_next:
    ldr x0, [x19]
    cbz x0, core_init_special_begin
    ldr x2, [x19, #8]
    mov x1, #1
    mov x3, #0
    bl core_bind
    add x19, x19, #16
    b core_init_primitive_next
core_init_special_begin:
    adr x19, core_special_table
core_init_special_next:
    ldr x0, [x19]
    cbz x0, core_init_done
    ldr x2, [x19, #8]
    mov x1, #5
    mov x3, #0
    bl core_bind
    add x19, x19, #16
    b core_init_special_next
core_init_done:
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

// Add a binding at the current compiler scope. Rebinding keeps already
// compiled instructions intact. x0 name,x1 kind,x2 argument1,x3 argument2.
core_bind:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x30, [sp, #32]
    mov x19, x0
    mov x20, x1
    mov x21, x2
    mov x25, x3
    adr x0, compiler_scope
    ldr x26, [x0]
    mov x0, #48
    bl arena_alloc
    ldr x1, [x26, #8]
    str x1, [x0]
    str x19, [x0, #8]
    str x20, [x0, #16]
    str x21, [x0, #24]
    str x25, [x0, #32]
    str x26, [x0, #40]
    str x0, [x26, #8]
    ldp x26, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

core_define:
    stp x19, x20, [sp, #-48]!
    stp x21, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    mov x21, x2
    mov x1, #2
    mov x2, x20
    mov x3, x21
    bl core_bind
    cbz x21, core_define_done
    adr x0, core_str_ampersand
    mov x1, x19
    bl string_concat
    mov x1, #2
    mov x2, x20
    mov x3, #0
    bl core_bind
core_define_done:
    ldp x21, x30, [sp, #16]
    ldp x19, x20, [sp], #48
    ret

core_lookup:
    stp x19, x20, [sp, #-48]!
    stp x21, x30, [sp, #16]
    mov x19, x0
    adr x0, compiler_scope
    ldr x20, [x0]
core_lookup_scope:
    cbz x20, core_lookup_missing
    ldr x21, [x20, #8]
core_lookup_entry:
    cbz x21, core_lookup_parent
    mov x0, x19
    ldr x1, [x21, #8]
    bl string_equal
    cbnz x0, core_lookup_found
    ldr x21, [x21]
    b core_lookup_entry
core_lookup_parent:
    ldr x20, [x20]
    b core_lookup_scope
core_lookup_found:
    mov x0, x21
    b core_lookup_done
core_lookup_missing:
    mov x0, #0
core_lookup_done:
    ldp x21, x30, [sp, #16]
    ldp x19, x20, [sp], #48
    ret

// Scopes retain own ip properties and inherit input, as Object.create(scope)
// does upstream. Fields +16/+24 are private extensions to the public prefix:
// ownInput=0 inherits; ownIndex=-1 inherits. Mirror the active scope in cells
// used by the compiler and primitives.
core_scope_refresh:
    adr x0, compiler_scope
    ldr x0, [x0]
    mov x1, x0
core_scope_input_parent:
    cbz x1, core_scope_input_missing
    ldr x2, [x1, #16]
    cbnz x2, core_scope_input_found
    ldr x1, [x1]
    b core_scope_input_parent
core_scope_input_missing:
    mov x2, #10
core_scope_input_found:
    adr x1, compiler_input
    str x2, [x1]
    mov x1, x0
core_scope_index_parent:
    cbz x1, core_scope_index_missing
    ldr x2, [x1, #24]
    cmp x2, #0
    b.ge core_scope_index_found
    ldr x1, [x1]
    b core_scope_index_parent
core_scope_index_missing:
    mov x2, #0
core_scope_index_found:
    adr x1, compiler_index
    str x2, [x1]
    ret

// x0 str,x1 start,x2 end -> copied JS-style substring (UTF16 units).
core_slice:
    ldr x3, [x0, #8]
    cmp x1, #0
    csel x1, xzr, x1, lt
    cmp x2, #0
    csel x2, xzr, x2, lt
    cmp x1, x3
    csel x1, x3, x1, hi
    cmp x2, x3
    csel x2, x3, x2, hi
    cmp x1, x2
    csel x4, x1, x2, ls
    csel x5, x2, x1, ls
    add x0, x0, #16
    add x0, x0, x4, lsl #1
    sub x1, x5, x4
    b string_new

core_is_space:
    cmp x0, #9
    b.lo core_space_no
    cmp x0, #13
    b.ls core_space_yes
    cmp x0, #32
    b.eq core_space_yes
    cmp x0, #160
    b.eq core_space_yes
    mov x1, #0x1680
    cmp x0, x1
    b.eq core_space_yes
    mov x1, #0x2000
    cmp x0, x1
    b.lo core_space_no
    mov x1, #0x200a
    cmp x0, x1
    b.ls core_space_yes
    mov x1, #0x2028
    cmp x0, x1
    b.eq core_space_yes
    add x1, x1, #1
    cmp x0, x1
    b.eq core_space_yes
    mov x1, #0x202f
    cmp x0, x1
    b.eq core_space_yes
    mov x1, #0x205f
    cmp x0, x1
    b.eq core_space_yes
    mov x1, #0x3000
    cmp x0, x1
    b.eq core_space_yes
    mov x1, #0xfeff
    cmp x0, x1
    b.eq core_space_yes
core_space_no:
    mov x0, #0
    ret
core_space_yes:
    mov x0, #1
    ret

core_read_char:
    adr x1, compiler_input
    ldr x1, [x1]
    cmp x1, #18
    b.ls core_read_char_end
    adr x2, compiler_index
    ldr x3, [x2]
    ldr x4, [x1, #8]
    cmp x3, x4
    b.hs core_read_char_end
    add x1, x1, #16
    add x1, x1, x3, lsl #1
    ldrh w0, [x1]
    add x3, x3, #1
    str x3, [x2]
    adr x4, compiler_scope
    ldr x4, [x4]
    str x3, [x4, #24]
    ret
core_read_char_end:
    mov x0, #-1
    ret

core_read_symbol:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x30, [sp, #32]
    adr x0, compiler_input
    ldr x19, [x0]
    cmp x19, #18
    b.ls core_read_symbol_empty
    adr x0, compiler_index
    ldr x20, [x0]
    ldr x21, [x19, #8]
    mov x25, #-1
core_read_symbol_next:
    cmp x20, x21
    b.hs core_read_symbol_eof
    add x0, x19, #16
    add x0, x0, x20, lsl #1
    ldrh w0, [x0]
    add x20, x20, #1
    bl core_is_space
    cbz x0, core_read_symbol_character
    cmp x25, #0
    b.lt core_read_symbol_next
    sub x26, x20, #1
    b core_read_symbol_finish
core_read_symbol_character:
    cmp x25, #0
    b.ge core_read_symbol_next
    sub x25, x20, #1
    b core_read_symbol_next
core_read_symbol_eof:
    mov x26, x20
core_read_symbol_finish:
    adr x0, compiler_index
    str x20, [x0]
    adr x1, compiler_scope
    ldr x1, [x1]
    str x20, [x1, #24]
    cmp x25, #0
    b.lt core_read_symbol_empty
    mov x0, x19
    mov x1, x25
    mov x2, x26
    bl core_slice
    b core_read_symbol_done
core_read_symbol_empty:
    adr x0, core_str_empty
core_read_symbol_done:
    ldp x26, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

// Source evaluation always uses an immediate sink, even when requested by a
// compile-time i[ block. Input, index and builder are restored on returns.
t0_eval:
    mov x1, #0
    b core_eval_source
// Compile generated source into the caller's builder and lexical scope. A
// zero builder naturally retains immediate evaluation at the top level.
core_compile_source:
    adr x1, compiler_builder
    ldr x1, [x1]
core_eval_source:
    mov x17, sp
    sub x17, x17, #96
    movz x18, #0x40a0, lsl #16
    cmp x17, x18
    b.lo fatal_native
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x30, [sp, #32]
    stp x27, x28, [sp, #48]
    mov x25, x0
    mov x27, x1
    cmp x0, #18
    b.ls core_error_source
    ldr x1, [x0]
    cmp x1, #1
    b.ne core_error_source
    adr x0, compiler_input
    ldr x19, [x0]
    str x25, [x0]
    adr x0, compiler_scope
    ldr x26, [x0]
    str x25, [x26, #16]
    adr x0, compiler_index
    ldr x20, [x0]
    str xzr, [x0]
    str xzr, [x26, #24]
    adr x0, compiler_builder
    ldr x21, [x0]
    str x27, [x0]
core_eval_next:
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_eval_done
    bl core_read_symbol
    ldr x1, [x0, #8]
    cbz x1, core_eval_done
    bl compile_symbol
    b core_eval_next
core_eval_done:
    adr x0, compiler_input
    str x19, [x0]
    str x19, [x26, #16]
    adr x0, compiler_index
    str x20, [x0]
    str x20, [x26, #24]
    adr x0, compiler_builder
    str x21, [x0]
    ldp x27, x28, [sp, #48]
    ldp x26, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

core_emit:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x30, [sp, #32]
    mov x19, x0
    mov x20, x1
    mov x21, x2
    mov x0, #32
    bl arena_alloc
    mov x25, x0
    str x19, [x25]
    str x20, [x25, #8]
    str x21, [x25, #16]
    str xzr, [x25, #24]
    adr x0, compiler_builder
    ldr x26, [x0]
    cbz x26, core_emit_immediate
    ldr x0, [x26, #8]
    cbz x0, core_emit_first
    str x25, [x0, #24]
    b core_emit_tail
core_emit_first:
    str x25, [x26]
    // A later `emit` can append the first instruction after a closure has
    // already captured this builder. Keep that template's head live.
    ldr x0, [x26, #16]
    cbz x0, core_emit_tail
    str x25, [x0]
core_emit_tail:
    str x25, [x26, #8]
    b core_emit_done
core_emit_immediate:
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_emit_done
    mov x0, x25
    bl core_execute_one
core_emit_done:
    mov x0, x25
    ldp x26, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

core_execute_one:
    ldr x1, [x0]
    br x1

execute_code:
    stp x19, x30, [sp, #-16]!
    mov x19, x0
core_execute_next:
    cbz x19, core_execute_done
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_execute_done
    mov x0, x19
    bl core_execute_one
    ldr x19, [x19, #24]
    b core_execute_next
core_execute_done:
    ldp x19, x30, [sp], #16
    ret

runtime_call:
    mov x17, sp
    sub x17, x17, #128
    movz x18, #0x40a0, lsl #16
    cmp x17, x18
    b.lo fatal_native
    stp x19, x20, [sp, #-80]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x28, x30, [sp, #48]
    cmp x0, #18
    b.ls core_error_function
    ldr x1, [x0]
    cmp x1, #2
    b.ne core_error_function
    mov x19, x0
    ldr x20, [x19, #8]
    ldr x21, [x20, #16]
    add x0, x21, #1
    lsl x0, x0, #3
    bl arena_alloc
    mov x25, x0
    ldr x0, [x19, #16]
    str x0, [x25]
    mov x26, #1
    mov x0, #10
core_call_initialize:
    cmp x26, x21
    b.hi core_call_parameters
    str x0, [x25, x26, lsl #3]
    add x26, x26, #1
    b core_call_initialize
core_call_parameters:
    ldr x27, [x20, #8]
    mov x26, #1
core_call_parameter_next:
    cmp x26, x27
    b.hi core_call_execute
    bl value_pop
    str x0, [x25, x26, lsl #3]
    add x26, x26, #1
    b core_call_parameter_next
core_call_execute:
    adr x0, current_frame
    ldr x28, [x0]
    str x25, [x0]
    ldr x0, [x20]
    bl execute_code
    adr x0, throw_pending
    ldr x0, [x0]
    cbz x0, core_call_restore
    adr x0, throw_value
    ldr x0, [x0]
    ldr x1, [x20, #24]
    bl string_equal
    cbz x0, core_call_restore
    adr x0, throw_pending
    str xzr, [x0]
core_call_restore:
    adr x0, current_frame
    str x28, [x0]
    ldp x28, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #80
    ret

core_op_native:
    ldr x1, [x0, #8]
    br x1
core_op_literal:
    ldr x0, [x0, #8]
    b value_push
core_op_closure:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    ldr x19, [x0, #8]
    adr x0, current_frame
    ldr x20, [x0]
    mov x0, #32
    bl heap_alloc
    mov x1, #2
    str x1, [x0]
    str x19, [x0, #8]
    str x20, [x0, #16]
    str xzr, [x0, #24]
    bl value_push
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
core_op_define:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    ldr x19, [x0, #8]
    ldr x20, [x0, #16]
    bl value_pop
    mov x1, x0
    mov x0, x19
    mov x2, x20
    bl core_define
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
core_op_method:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    ldr x20, [x0, #8]
    bl value_pop
    mov x19, x0
    bl value_push
    mov x0, x20
    bl value_push
    mov x0, x19
    bl value_push
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret
core_op_throw:
    ldr x0, [x0, #8]
    adr x1, throw_value
    str x0, [x1]
    adr x1, throw_pending
    mov x0, #1
    str x0, [x1]
    ret
core_op_input:
    adr x0, compiler_input
    ldr x0, [x0]
    b value_push
core_op_ip:
    stp x29, x30, [sp, #-16]!
    adr x0, compiler_index
    ldr x0, [x0]
    bl number_from_int
    bl value_push
    ldp x29, x30, [sp], #16
    ret

core_local_address:
    ldr x1, [x0, #8]
    ldr x2, [x0, #16]
    adr x0, current_frame
    ldr x0, [x0]
core_local_parent:
    cbz x0, core_error_frame
    cbz x2, core_local_found
    ldr x0, [x0]
    sub x2, x2, #1
    b core_local_parent
core_local_found:
    add x0, x0, x1, lsl #3
    ret
core_op_local_read:
    stp x29, x30, [sp, #-16]!
    bl core_local_address
    ldr x0, [x0]
    bl value_push
    ldp x29, x30, [sp], #16
    ret
core_op_local_write:
    stp x19, x30, [sp, #-16]!
    bl core_local_address
    mov x19, x0
    bl value_pop
    str x0, [x19]
    ldp x19, x30, [sp], #16
    ret
core_op_local_increment:
    mov x1, #1
    b core_local_change
core_op_local_decrement:
    mov x1, #-1
core_local_change:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x20, x1
    bl core_local_address
    mov x19, x0
    ldr x0, [x19]
    bl value_to_number
    scvtf d1, x20
    fadd d0, d0, d1
    bl number_box
    str x0, [x19]
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

core_dynamic_lookup:
    stp x19, x30, [sp, #-16]!
    bl core_lookup
    cbz x0, core_error_unknown
    adr x1, compiler_builder
    ldr x19, [x1]
    str xzr, [x1]
    bl core_compile_entry
    adr x0, compiler_builder
    str x19, [x0]
    ldp x19, x30, [sp], #16
    ret
core_op_dynamic:
    ldr x0, [x0, #8]
    b core_dynamic_lookup
core_op_scope_lookup:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    ldr x19, [x0, #8]
    bl value_pop
    bl value_to_string
    adr x1, compiler_scope
    ldr x20, [x1]
    str x19, [x1]
    stp x0, xzr, [sp, #-16]!
    bl core_scope_refresh
    ldp x0, xzr, [sp], #16
    bl core_dynamic_lookup
    adr x0, compiler_scope
    str x20, [x0]
    bl core_scope_refresh
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

core_compile_entry:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x30, [sp, #32]
    mov x19, x0
    ldr x0, [x19, #16]
    cmp x0, #1
    b.eq core_compile_native
    cmp x0, #2
    b.eq core_compile_constant
    cmp x0, #3
    b.eq core_compile_local
    cmp x0, #4
    b.eq core_compile_named_return
    cmp x0, #5
    b.eq core_compile_special
    b core_error_binding
core_compile_native:
    adr x0, core_op_native
    ldr x1, [x19, #24]
    mov x2, #0
    bl core_emit
    b core_compile_entry_done
core_compile_constant:
    adr x0, core_op_literal
    ldr x1, [x19, #24]
    mov x2, #0
    bl core_emit
    ldr x0, [x19, #32]
    cbz x0, core_compile_entry_done
    adr x0, core_str_call
    bl compile_symbol
    b core_compile_entry_done
core_compile_local:
    adr x0, compiler_scope
    ldr x20, [x0]
    ldr x25, [x19, #40]
    mov x21, #0
core_compile_local_depth:
    cmp x20, x25
    b.eq core_compile_local_found
    cbz x20, core_error_frame
    ldr x20, [x20]
    add x21, x21, #1
    b core_compile_local_depth
core_compile_local_found:
    ldr x0, [x19, #32]
    adr x1, core_local_handlers
    ldr x0, [x1, x0, lsl #3]
    ldr x1, [x19, #24]
    mov x2, x21
    bl core_emit
    b core_compile_entry_done
core_compile_named_return:
    adr x0, core_op_throw
    ldr x1, [x19, #24]
    mov x2, #0
    bl core_emit
    b core_compile_entry_done
core_compile_special:
    ldr x0, [x19, #24]
    blr x0
core_compile_entry_done:
    ldp x26, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

compile_symbol:
    mov x17, sp
    sub x17, x17, #128
    movz x18, #0x40a0, lsl #16
    cmp x17, x18
    b.lo fatal_native
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x30, [sp, #32]
    mov x19, x0
    bl core_lookup
    cbz x0, core_symbol_fallback
    bl core_compile_entry
    b core_symbol_done
core_symbol_fallback:
    ldr x20, [x19, #8]
    cbz x20, core_error_unknown
    ldrh w21, [x19, #16]
    cmp x21, #46
    b.eq core_symbol_method
    cmp x21, #58
    b.eq core_symbol_definition
    add x0, x19, #14
    add x0, x0, x20, lsl #1
    ldrh w0, [x0]
    cmp x0, #58
    b.eq core_symbol_name
    cmp x21, #48
    b.lo core_symbol_negative
    cmp x21, #57
    b.ls core_symbol_number
core_symbol_negative:
    cmp x21, #45
    b.ne core_symbol_quote
    cmp x20, #1
    b.hi core_symbol_number
core_symbol_quote:
    cmp x21, #39
    b.eq core_symbol_quoted_name
    adr x0, core_op_dynamic
    mov x1, x19
    mov x2, #0
    bl core_emit
    b core_symbol_done
core_symbol_method:
    mov x0, x19
    mov x1, #1
    mov x2, x20
    bl core_slice
    mov x1, x0
    adr x0, core_op_method
    mov x2, #0
    bl core_emit
    adr x0, core_str_call
    bl compile_symbol
    adr x0, core_str_call
    bl compile_symbol
    b core_symbol_done
core_symbol_definition:
    mov x25, #0
    mov x1, #1
    cmp x20, #2
    b.lo core_symbol_definition_slice
    ldrh w0, [x19, #18]
    cmp x0, #58
    b.ne core_symbol_definition_slice
    mov x25, #1
    mov x1, #2
core_symbol_definition_slice:
    mov x0, x19
    mov x2, x20
    bl core_slice
    mov x1, x0
    adr x0, core_op_define
    mov x2, x25
    bl core_emit
    b core_symbol_done
core_symbol_name:
    mov x0, x19
    mov x1, #0
    sub x2, x20, #1
    bl core_slice
    b core_symbol_literal
core_symbol_quoted_name:
    mov x0, x19
    mov x1, #1
    mov x2, x20
    bl core_slice
    b core_symbol_literal
core_symbol_number:
    mov x0, x19
    mov x1, #0
    bl number_parse
    bl number_box
core_symbol_literal:
    mov x1, x0
    adr x0, core_op_literal
    mov x2, #0
    bl core_emit
core_symbol_done:
    ldp x26, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

// Compile four accessor bindings for a parameter or let-local.
core_define_local:
    stp x19, x20, [sp, #-32]!
    stp x29, x30, [sp, #16]
    mov x19, x0
    mov x20, x1
    mov x1, #3
    mov x2, x20
    mov x3, #0
    bl core_bind
    adr x0, core_str_colon
    mov x1, x19
    bl string_concat
    mov x1, #3
    mov x2, x20
    mov x3, #1
    bl core_bind
    mov x0, x19
    adr x1, core_str_increment
    bl string_concat
    mov x1, #3
    mov x2, x20
    mov x3, #2
    bl core_bind
    mov x0, x19
    adr x1, core_str_decrement
    bl string_concat
    mov x1, #3
    mov x2, x20
    mov x3, #3
    bl core_bind
    ldp x29, x30, [sp, #16]
    ldp x19, x20, [sp], #32
    ret

core_compile_block:
    mov x17, sp
    sub x17, x17, #192
    movz x18, #0x40a0, lsl #16
    cmp x17, x18
    b.lo fatal_native
    stp x19, x20, [sp, #-128]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x28, x30, [sp, #48]
    adr x0, compiler_index
    ldr x0, [x0]
    str x0, [sp, #64]
    adr x0, core_str_empty
    str x0, [sp, #72]
    adr x0, compiler_scope
    ldr x19, [x0]
    adr x0, compiler_builder
    ldr x20, [x0]
    mov x0, #32
    bl arena_alloc
    mov x21, x0
    str x19, [x21]
    str xzr, [x21, #8]
    str xzr, [x21, #16]
    mov x0, #-1
    str x0, [x21, #24]
    adr x0, compiler_scope
    str x21, [x0]
    mov x0, #24
    bl arena_alloc
    mov x25, x0
    str xzr, [x25]
    str xzr, [x25, #8]
    str xzr, [x25, #16]
    adr x0, compiler_builder
    str x25, [x0]
    mov x26, #0
    mov x27, #0
    str xzr, [sp, #96]
core_block_parameter_next:
    bl core_read_symbol
    ldr x1, [x0, #8]
    cbz x1, core_error_unterminated_block
    str x0, [sp, #80]
    cmp x1, #1
    b.ne core_block_check_let
    ldrh w1, [x0, #16]
    cmp x1, #124
    b.eq core_block_parameters_done
core_block_check_let:
    adr x1, core_str_let
    bl string_equal
    cbnz x0, core_block_parameters_done
    ldr x0, [sp, #80]
    cbnz x27, core_block_parameter_add
    ldrh w1, [x0, #16]
    cmp x1, #58
    b.ne core_block_parameter_add
    ldr x2, [x0, #8]
    mov x1, #1
    bl core_slice
    str x0, [sp, #72]
    adr x1, core_str_return_suffix
    bl string_concat
    mov x1, #4
    ldr x2, [sp, #72]
    mov x3, #0
    bl core_bind
    b core_block_parameter_next
core_block_parameter_add:
    mov x0, #16
    bl arena_alloc
    str xzr, [x0]
    ldr x1, [sp, #80]
    str x1, [x0, #8]
    ldr x1, [sp, #96]
    cbz x1, core_block_parameter_first
    str x0, [x1]
    b core_block_parameter_linked
core_block_parameter_first:
    mov x26, x0
core_block_parameter_linked:
    str x0, [sp, #96]
    add x27, x27, #1
    b core_block_parameter_next
core_block_parameters_done:
    mov x28, x27
core_block_parameter_bind:
    cbz x26, core_block_parameters_bound
    ldr x0, [x26, #8]
    mov x1, x28
    bl core_define_local
    sub x28, x28, #1
    ldr x26, [x26]
    b core_block_parameter_bind
core_block_parameters_bound:
    mov x28, x27
    ldr x0, [sp, #80]
    adr x1, core_str_let
    bl string_equal
    cbz x0, core_block_body_next
core_block_local_next:
    bl core_read_symbol
    ldr x1, [x0, #8]
    cbz x1, core_error_unterminated_block
    str x0, [sp, #80]
    cmp x1, #1
    b.ne core_block_local_check
    ldrh w1, [x0, #16]
    cmp x1, #124
    b.eq core_block_body_next
core_block_local_check:
    ldrh w1, [x0, #16]
    cmp x1, #58
    b.eq core_block_local_define
    bl compile_symbol
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_block_aborted
    b core_block_local_next
core_block_local_define:
    ldr x2, [x0, #8]
    mov x1, #1
    bl core_slice
    add x28, x28, #1
    mov x1, x28
    bl core_define_local
    ldr x0, [sp, #80]
    bl compile_symbol
    b core_block_local_next
core_block_body_next:
    bl core_read_symbol
    ldr x1, [x0, #8]
    cbz x1, core_error_unterminated_block
    cmp x1, #1
    b.ne core_block_body_compile
    ldrh w1, [x0, #16]
    cmp x1, #125
    b.eq core_block_complete
core_block_body_compile:
    bl compile_symbol
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_block_aborted
    b core_block_body_next
core_block_complete:
    adr x0, compiler_input
    ldr x0, [x0]
    ldr x1, [sp, #64]
    sub x1, x1, #2
    adr x2, compiler_index
    ldr x2, [x2]
    sub x2, x2, #1
    bl core_slice
    str x0, [sp, #88]
    mov x0, #48
    bl arena_alloc
    ldr x1, [x25]
    str x1, [x0]
    str x27, [x0, #8]
    str x28, [x0, #16]
    ldr x1, [sp, #72]
    str x1, [x0, #24]
    ldr x1, [sp, #88]
    str x1, [x0, #32]
    str x21, [x0, #40]
    str x0, [x25, #16]
    mov x26, x0
    adr x0, compiler_index
    ldr x0, [x0]
    str x0, [x19, #24]
    adr x0, compiler_scope
    str x19, [x0]
    adr x0, compiler_builder
    str x20, [x0]
    adr x0, core_op_closure
    mov x1, x26
    mov x2, #0
    bl core_emit
    b core_block_done
core_block_aborted:
    adr x0, compiler_index
    ldr x0, [x0]
    str x0, [x19, #24]
    adr x0, compiler_scope
    str x19, [x0]
    adr x0, compiler_builder
    str x20, [x0]
core_block_done:
    ldp x28, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #128
    ret

core_compile_input:
    adr x0, core_op_input
    mov x1, #0
    mov x2, #0
    b core_emit
core_compile_ip:
    adr x0, core_op_ip
    mov x1, #0
    mov x2, #0
    b core_emit
core_compile_return:
    adr x0, core_op_throw
    adr x1, core_str_empty
    mov x2, #0
    b core_emit
core_compile_scope_lookup:
    adr x0, compiler_scope
    ldr x1, [x0]
    adr x0, core_op_scope_lookup
    mov x2, #0
    b core_emit

// Parsing and translation run in guest T0 (`jsCompile`). Emit generated T0
// into the active builder so local references and side effects execute with
// the surrounding function.
core_compile_js:
    stp x19, x20, [sp, #-64]!
    stp x21, x25, [sp, #16]
    stp x26, x30, [sp, #32]
    adr x0, compiler_input
    ldr x19, [x0]
    adr x0, compiler_index
    ldr x20, [x0]
    mov x21, x20
core_js_scan:
    bl core_read_symbol
    ldr x1, [x0, #8]
    cbz x1, core_error_unterminated_js
    adr x1, core_str_js_close
    bl string_equal
    cbnz x0, core_js_source
    adr x0, compiler_index
    ldr x21, [x0]
    b core_js_scan
core_js_source:
    adr x0, core_str_js_compile
    bl core_lookup
    cbz x0, core_error_js_missing
    mov x0, x19
    mov x1, x20
    mov x2, x21
    bl core_slice
    bl value_push
    adr x0, core_str_js_compile
    bl core_dynamic_lookup
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_js_done
    bl value_pop
    cmp x0, #18
    b.ls core_error_js_invalid
    ldr x1, [x0]
    cmp x1, #1
    b.ne core_error_js_invalid
    bl core_compile_source
core_js_done:
    ldp x26, x30, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #64
    ret

// Read literal UTF16 text up to a repeated delimiter; unlike the upstream
// JavaScript's infinite EOF loops, malformed unterminated input is diagnosed.
core_read_until:
    stp x19, x20, [sp, #-80]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x28, x30, [sp, #48]
    mov x26, x0
    mov x27, x1
    adr x0, compiler_input
    ldr x19, [x0]
    ldr x25, [x19, #8]
    adr x0, compiler_index
    ldr x20, [x0]
    mov x21, x20
core_until_next:
    add x0, x21, x27
    cmp x0, x25
    b.hi core_error_unterminated_literal
    mov x28, #0
core_until_match:
    cmp x28, x27
    b.hs core_until_found
    add x0, x21, x28
    add x1, x19, #16
    add x1, x1, x0, lsl #1
    ldrh w0, [x1]
    cmp x0, x26
    b.ne core_until_advance
    add x28, x28, #1
    b core_until_match
core_until_advance:
    add x21, x21, #1
    b core_until_next
core_until_found:
    add x0, x21, x27
    adr x1, compiler_index
    str x0, [x1]
    adr x1, compiler_scope
    ldr x1, [x1]
    str x0, [x1, #24]
    mov x0, x19
    mov x1, x20
    mov x2, x21
    bl core_slice
    ldp x28, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #80
    ret
core_compile_quote:
    mov x1, #1
    b core_compile_string
core_compile_triple:
    mov x1, #3
core_compile_string:
    stp x29, x30, [sp, #-16]!
    mov x0, #34
    bl core_read_until
    mov x1, x0
    adr x0, core_op_literal
    mov x2, #0
    bl core_emit
    ldp x29, x30, [sp], #16
    ret
core_compile_immediate:
    stp x29, x30, [sp, #-16]!
    adr x0, compiler_builder
    ldr x0, [x0]
    adr x1, outer_builder
    str x0, [x1]
    mov x0, #93
    mov x1, #1
    bl core_read_until
    bl t0_eval
    ldp x29, x30, [sp], #16
    ret
core_compile_emit:
    stp x19, x30, [sp, #-16]!
    adr x0, outer_builder
    ldr x0, [x0]
    mov x1, #-1
    cmp x0, x1
    b.eq core_error_emit
    adr x1, compiler_builder
    ldr x19, [x1]
    str x0, [x1]
    bl value_pop
    mov x1, x0
    adr x0, core_op_literal
    mov x2, #0
    bl core_emit
    adr x0, compiler_builder
    str x19, [x0]
    ldp x19, x30, [sp], #16
    ret
core_compile_line_comment:
    stp x29, x30, [sp, #-16]!
core_line_comment_next:
    bl core_read_char
    cmp x0, #10
    b.eq core_line_comment_done
    cmp x0, #0
    b.ge core_line_comment_next
core_line_comment_done:
    ldp x29, x30, [sp], #16
    ret
core_compile_block_comment:
    stp x29, x30, [sp, #-16]!
core_block_comment_next:
    bl core_read_symbol
    ldr x1, [x0, #8]
    cbz x1, core_error_unterminated_comment
    adr x1, core_str_comment_end
    bl string_equal
    cbz x0, core_block_comment_next
    ldp x29, x30, [sp], #16
    ret

// Switch options retain one node per upstream JS closure. Compile-time keys
// execute exactly one node, including multi-node auto-call/name expansion.
core_compile_switch:
    stp x19, x20, [sp, #-96]!
    stp x21, x25, [sp, #16]
    stp x26, x27, [sp, #32]
    stp x28, x30, [sp, #48]
    adr x0, compiler_builder
    ldr x19, [x0]
    mov x0, #24
    bl arena_alloc
    mov x20, x0
    str xzr, [x20]
    str xzr, [x20, #8]
    str xzr, [x20, #16]
    adr x0, compiler_builder
    str x20, [x0]
core_switch_compile_next:
    bl core_read_symbol
    ldr x1, [x0, #8]
    cbz x1, core_error_unterminated_switch
    mov x21, x0
    adr x1, core_str_end
    bl string_equal
    cbnz x0, core_switch_compile_done
    mov x0, x21
    bl compile_symbol
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_switch_aborted
    b core_switch_compile_next
core_switch_compile_done:
    // Key execution happens after collecting all options, while the caller's
    // builder remains current for nested emit/immediate compiler operations.
    adr x0, compiler_builder
    str x19, [x0]
    mov x0, #32
    bl arena_alloc
    mov x21, x0
    str xzr, [x21]
    ldr x0, [x20, #8]
    str x0, [x21, #8]
    str xzr, [x21, #16]
    str x20, [x21, #24]
    ldr x25, [x20]
    mov x26, #0
core_switch_key_next:
    cbz x25, core_switch_ready
    ldr x27, [x25, #24]
    cbz x27, core_switch_ready
    mov x0, x25
    bl core_execute_one
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, core_switch_aborted
    bl value_pop
    mov x28, x0
    mov x0, #24
    bl arena_alloc
    str x28, [x0]
    str x27, [x0, #8]
    str xzr, [x0, #16]
    cbz x26, core_switch_first_pair
    str x0, [x26, #16]
    b core_switch_pair_linked
core_switch_first_pair:
    str x0, [x21]
core_switch_pair_linked:
    mov x26, x0
    ldr x0, [x21, #16]
    add x0, x0, #1
    str x0, [x21, #16]
    ldr x25, [x27, #24]
    b core_switch_key_next
core_switch_ready:
    adr x0, core_op_switch
    mov x1, x21
    mov x2, #0
    bl core_emit
    b core_switch_done
core_switch_aborted:
    adr x0, compiler_builder
    str x19, [x0]
core_switch_done:
    ldp x28, x30, [sp, #48]
    ldp x26, x27, [sp, #32]
    ldp x21, x25, [sp, #16]
    ldp x19, x20, [sp], #96
    ret

core_op_switch:
    stp x19, x20, [sp, #-48]!
    stp x21, x30, [sp, #16]
    ldr x19, [x0, #8]
    bl value_pop
    mov x20, x0
    ldr x21, [x19]
core_switch_choose:
    cbz x21, core_switch_default
    mov x0, x20
    ldr x1, [x21]
    bl value_equal
    cbnz x0, core_switch_chosen
    ldr x21, [x21, #16]
    b core_switch_choose
core_switch_chosen:
    ldr x0, [x21, #8]
    b core_switch_execute
core_switch_default:
    ldr x0, [x19, #24]
    ldr x0, [x0, #8]
    cbz x0, core_error_empty_switch
core_switch_execute:
    bl core_execute_one
    ldp x21, x30, [sp, #16]
    ldp x19, x20, [sp], #48
    ret

core_error_source:
    adr x0, core_message_source
    b runtime_error
core_error_function:
    adr x0, core_message_function
    b runtime_error
core_error_unknown:
    adr x0, core_message_unknown
    b runtime_error
core_error_frame:
    adr x0, core_message_frame
    b runtime_error
core_error_binding:
    adr x0, core_message_binding
    b runtime_error
core_error_unterminated_block:
    adr x0, core_message_unterminated_block
    b runtime_error
core_error_unterminated_literal:
    adr x0, core_message_unterminated_literal
    b runtime_error
core_error_unterminated_comment:
    adr x0, core_message_unterminated_comment
    b runtime_error
core_error_unterminated_switch:
    adr x0, core_message_unterminated_switch
    b runtime_error
core_error_empty_switch:
    adr x0, core_message_empty_switch
    b runtime_error
core_error_emit:
    adr x0, core_message_emit
    b runtime_error
core_error_unterminated_js:
    adr x0, core_message_unterminated_js
    b runtime_error
core_error_js_missing:
    adr x0, core_message_js_missing
    b runtime_error
core_error_js_invalid:
    adr x0, core_message_js_invalid
    b runtime_error

.balign 8
compiler_scope: .quad 0
global_scope: .quad 0
current_frame: .quad 0
compiler_input: .quad 0
compiler_index: .quad 0
compiler_builder: .quad 0
outer_builder: .quad -1
throw_pending: .quad 0
throw_value: .quad 10
repl_saved_sp: .quad 0
core_local_handlers:
    .quad core_op_local_read, core_op_local_write
    .quad core_op_local_increment, core_op_local_decrement
core_special_table:
    .quad core_str_open_block, core_compile_block
    .quad core_str_switch, core_compile_switch
    .quad core_str_immediate, core_compile_immediate
    .quad core_str_emit, core_compile_emit
    .quad core_str_quote, core_compile_quote
    .quad core_str_triple, core_compile_triple
    .quad core_str_line_comment, core_compile_line_comment
    .quad core_str_block_comment, core_compile_block_comment
    .quad core_str_scope_lookup, core_compile_scope_lookup
    .quad core_str_input, core_compile_input
    .quad core_str_ip, core_compile_ip
    .quad core_str_return, core_compile_return
    .quad core_str_js_open, core_compile_js
    .quad 0, 0

core_message_source: .asciz "eval requires a string"
core_message_function: .asciz "value is not a function"
core_message_unknown: .asciz "unknown word"
core_message_frame: .asciz "lexical frame is unavailable"
core_message_binding: .asciz "invalid compiler binding"
core_message_unterminated_block: .asciz "unterminated block"
core_message_unterminated_literal: .asciz "unterminated literal or i[ block"
core_message_unterminated_comment: .asciz "unterminated block comment"
core_message_unterminated_switch: .asciz "unterminated switch"
core_message_empty_switch: .asciz "empty switch has no default operation"
core_message_emit: .asciz "emit requires a preceding i[ compiler context"
core_message_unterminated_js: .asciz "unterminated js{ block (expected }js)"
core_message_js_missing: .asciz "js{ requires the loaded jsCompile language adapter"
core_message_js_invalid: .asciz "invalid JS-like source in js{ block"
.balign 8
core_str_empty:
    .quad 1, 0
    .byte 0, 0
.balign 8
core_str_ampersand:
    .quad 1, 1
    .byte 38, 0, 0, 0
.balign 8
core_str_call:
    .quad 1, 2
    .byte 40, 0, 41, 0, 0, 0
.balign 8
core_str_colon:
    .quad 1, 1
    .byte 58, 0, 0, 0
.balign 8
core_str_increment:
    .quad 1, 2
    .byte 43, 0, 43, 0, 0, 0
.balign 8
core_str_decrement:
    .quad 1, 2
    .byte 45, 0, 45, 0, 0, 0
.balign 8
core_str_return_suffix:
    .quad 1, 2
    .byte 60, 0, 45, 0, 0, 0
.balign 8
core_str_let:
    .quad 1, 3
    .byte 108, 0, 101, 0, 116, 0, 0, 0
.balign 8
core_str_comment_end:
    .quad 1, 2
    .byte 42, 0, 47, 0, 0, 0
.balign 8
core_str_end:
    .quad 1, 3
    .byte 101, 0, 110, 0, 100, 0, 0, 0
.balign 8
core_str_open_block:
    .quad 1, 1
    .byte 123, 0, 0, 0
.balign 8
core_str_switch:
    .quad 1, 6
    .byte 115, 0, 119, 0, 105, 0, 116, 0, 99, 0, 104, 0, 0, 0
.balign 8
core_str_immediate:
    .quad 1, 2
    .byte 105, 0, 91, 0, 0, 0
.balign 8
core_str_emit:
    .quad 1, 4
    .byte 101, 0, 109, 0, 105, 0, 116, 0, 0, 0
.balign 8
core_str_quote:
    .quad 1, 1
    .byte 34, 0, 0, 0
.balign 8
core_str_triple:
    .quad 1, 3
    .byte 34, 0, 34, 0, 34, 0, 0, 0
.balign 8
core_str_line_comment:
    .quad 1, 2
    .byte 47, 0, 47, 0, 0, 0
.balign 8
core_str_block_comment:
    .quad 1, 2
    .byte 47, 0, 42, 0, 0, 0
.balign 8
core_str_scope_lookup:
    .quad 1, 2
    .byte 63, 0, 63, 0, 0, 0
.balign 8
core_str_input:
    .quad 1, 6
    .byte 105, 0, 110, 0, 112, 0, 117, 0, 116, 0, 95, 0, 0, 0
.balign 8
core_str_ip:
    .quad 1, 3
    .byte 105, 0, 112, 0, 95, 0, 0, 0
.balign 8
core_str_return:
    .quad 1, 2
    .byte 60, 0, 45, 0, 0, 0
.balign 8
core_str_js_open:
    .quad 1, 3
    .byte 106, 0, 115, 0, 123, 0, 0, 0
.balign 8
core_str_js_close:
    .quad 1, 3
    .byte 125, 0, 106, 0, 115, 0, 0, 0
.balign 8
core_str_js_compile:
    .quad 1, 9
    .byte 106, 0, 115, 0, 67, 0, 111, 0, 109, 0, 112, 0, 105, 0, 108, 0, 101, 0, 0, 0
.balign 8

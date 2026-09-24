_start:
    mov x0, #0x40c00000
    mov sp, x0
    msr daifset, #15
    mrs x0, cpacr_el1
    orr x0, x0, #0x300000
    msr cpacr_el1, x0
    isb
    mov x22, #0x40800000
    mov x23, #0x41000000
    mov x24, #0x48000000
    adr x0, full_boot_complete
    str xzr, [x0]
    adr x0, stringify_active
    str xzr, [x0]
    adr x0, full_reader
    str xzr, [x0]
    adr x0, repl_saved_sp
    mov x1, sp
    str x1, [x0]
    adr x0, full_boot_banner
    bl puts
    bl core_init
    adr x0, boot_prelude
    bl t0_eval
    bl full_boot_check
    adr x0, module_parsers
    bl t0_eval
    bl full_boot_check
    adr x0, module_jsparser
    bl t0_eval
    bl full_boot_check
    adr x0, module_som
    bl t0_eval
    bl full_boot_check
full_boot_ready:
    adr x0, full_boot_complete
    mov x1, #1
    str x1, [x0]
    adr x0, full_ready_message
    bl puts
    b full_repl
full_repl_recover:
    adr x0, full_boot_complete
    ldr x0, [x0]
    cbz x0, full_boot_failed
    adr x0, repl_saved_sp
    ldr x0, [x0]
    mov sp, x0
    adr x0, global_scope
    ldr x0, [x0]
    adr x1, compiler_scope
    str x0, [x1]
    adr x0, compiler_builder
    str xzr, [x0]
    adr x0, current_frame
    str xzr, [x0]
    adr x0, throw_pending
    str xzr, [x0]
    adr x0, compiler_input
    adr x1, str_empty
    str x1, [x0]
    adr x0, compiler_index
    str xzr, [x0]
    adr x0, stringify_active
    str xzr, [x0]
    // User values remain as in upstream after a partial evaluation error.
full_repl:
    adr x0, full_reader
    ldr x1, [x0]
    adr x0, full_prompt_t0
    cbz x1, full_repl_prompt
    adr x0, full_prompt_js
    cmp x1, #1
    b.eq full_repl_prompt
    adr x0, full_prompt_som
full_repl_prompt:
    bl puts
    bl read_source
    cbnz x1, full_input_overflow
    mov x20, x0
    cbnz x2, full_repl_source
    // Exact terminal lines only: pasted text always reaches the reader.
    adr x0, full_input_buffer
    adr x1, full_command_t0
    bl full_ascii_equal
    cbnz x0, full_choose_t0
    adr x0, full_input_buffer
    adr x1, full_command_js
    bl full_ascii_equal
    cbnz x0, full_choose_js
    adr x0, full_input_buffer
    adr x1, full_command_som
    bl full_ascii_equal
    cbnz x0, full_choose_som
    adr x0, full_input_buffer
    adr x1, full_command_help
    bl full_ascii_equal
    cbnz x0, full_show_help
full_repl_source:
    mov x1, x20
    adr x0, full_input_buffer
    bl string_from_utf8
    mov x19, x22
    adr x1, full_reader
    ldr x1, [x1]
    cbnz x1, full_language_repl
    bl t0_eval
    b full_repl_check_throw
full_language_repl:
    bl value_push
    adr x0, full_reader
    ldr x1, [x0]
    adr x0, js_eval_command
    cmp x1, #1
    b.eq full_language_eval
    adr x0, som_eval_command
full_language_eval:
    bl t0_eval
    cmp x22, x19
    b.ls full_repl_check_throw
    ldr x0, [x22, #-8]
    bl print_value
    bl newline
full_repl_check_throw:
    adr x0, throw_pending
    ldr x0, [x0]
    cbz x0, full_repl
    adr x0, full_uncaught_message
    b runtime_error
full_show_help:
    adr x0, full_help_message
    bl puts
    b full_repl
full_choose_t0:
    mov x0, #0
    b full_select_reader
full_choose_js:
    mov x0, #1
    b full_select_reader
full_choose_som:
    mov x0, #2
full_select_reader:
    adr x1, full_reader
    str x0, [x1]
    b full_repl
full_input_overflow:
    adr x0, full_input_message
    b runtime_error
full_boot_check:
    adr x0, throw_pending
    ldr x0, [x0]
    cbnz x0, full_boot_failed
    ret
full_boot_failed:
    adr x0, full_boot_failure_message
    b fatal_halt
full_boot_banner:
    .asciz "\r\nTURTLES / AArch64 bare metal\r\nNative T0 compiler + VM | binary64 | UTF-16 | no C\r\nMonotonic arena and heap: exhaustion HALTS until reboot.\r\nReaders: :t0 :js :som | :help\r\nMultiline input: :paste, source lines, then :end (:cancel to discard).\r\n"
full_ready_message: .asciz "Raw T0 REPL ready.\r\n"
full_prompt_t0: .asciz "t0> "
full_prompt_js: .asciz "js> "
full_prompt_som: .asciz "som> "
full_command_t0: .asciz ":t0"
full_command_js: .asciz ":js"
full_command_som: .asciz ":som"
full_command_help: .asciz ":help"
full_help_message:
    .asciz "Readers: :t0 :js :som (preserve definitions and values).\r\nMultiline: :paste, source lines, :end; :cancel discards.\r\nT0 uses print; JS and SOM display the newest result.\r\nIn T0, reset clears the environment and returns to t0>.\r\n"
full_input_message:
    .asciz "input exceeds 65535 UTF8 bytes"
full_uncaught_message:
    .asciz "uncaught T0 return"
full_boot_failure_message:
    .asciz "HALTED: initialization failed. Rebuild or reboot the guest."
.align 3
full_boot_complete:
    .quad 0
full_reader: .quad 0
full_input_buffer:
    .space 65536

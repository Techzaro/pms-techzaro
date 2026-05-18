

const CreateNewTask = ({ className = "" }) => {
  return (
    <form
      className={`m-0 w-[998px] shadow-[0px_20px_60px_12px_rgba(16,_24,_40,_0.18)] rounded-3xl bg-[#fff] border-[#eaecf0] border-solid border-[1px] box-border max-w-full overflow-hidden flex flex-col items-center gap-2.5 leading-[normal] tracking-[normal] ${className}`}
    >
      <div className="self-stretch border-[#eaecf0] border-solid border-b-[1px] box-border flex items-center justify-between pt-5 px-5 pb-[18px] gap-5 max-w-full mq675:flex-wrap mq675:gap-5">
        <div className="flex items-center gap-2.5 max-w-full mq450:flex-wrap">
          <div className="h-[54px] w-[54px] rounded-lg bg-[#eceafe] flex items-center justify-center py-3 px-3.5 box-border">
            <div className="flex items-center justify-center">
              <img
                className="cursor-pointer [border:none] p-0 bg-[transparent] h-[18px] w-[18px] relative"
                type="submit"
                alt=""
                src="/Header-Icon.svg"
              />
            </div>
          </div>
          <div className="flex flex-col items-start p-2.5 box-border gap-2 max-w-full">
            <h3 className="m-0 self-stretch relative text-2xl font-bold font-[Inter] text-[#101828] text-left mq450:text-[19px]">
              Create New Project
            </h3>
            <div className="relative text-sm font-[Inter] text-[#667085] text-left">
              Add project details and assign it to team members.
            </div>
          </div>
        </div>
        <div className="rounded-[10px] bg-[#f9fafb] flex items-center p-2.5">
          <img
            className="cursor-pointer [border:none] p-0 bg-[transparent] h-4 w-4 relative"
            type="submit"
            alt=""
            src="/Close-Icon.svg"
          />
        </div>
      </div>
      <main className="self-stretch flex items-start p-5 box-border gap-4 max-w-full mq800:flex-wrap">
        <section className="self-stretch w-[560px] flex flex-col items-start gap-7 max-w-full mq675:min-w-full mq800:flex-1">
          <div className="self-stretch flex flex-col items-start">
            <div className="self-stretch flex flex-col items-start p-2.5 gap-2.5">
              <div className="flex items-center">
                <div className="relative text-sm font-semibold font-[Inter] text-left">
                  <span className="text-[#374151]">{`Project Name `}</span>
                  <span className="text-[#ff2d55]">*</span>
                </div>
              </div>
              <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center py-2.5 px-3">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-8 w-[33px] rounded-lg bg-[rgba(236,234,254,0.27)] flex items-center justify-center">
                    <img src="/Header-Icon.svg" alt="" />
                  </div>
                  <input
                    className="w-[calc(100%_-_18px)] [border:none] [outline:none] bg-[transparent] h-[17px] flex items-center font-[Inter] font-medium text-sm text-[#6b7280] min-w-[82px]"
                    placeholder="Enter Project name.."
                    type="text"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="self-stretch flex flex-col items-start p-2.5">
            <div className="self-stretch flex flex-col items-start gap-2.5">
              <div className="flex items-center">
                <div className="relative text-sm font-semibold font-[Inter] text-[#374151] text-left">
                  Description
                </div>
              </div>
              <div className="self-stretch h-60 rounded-xl border-[#e5e7eb] border-solid border-[1px] box-border flex flex-col items-start mq450:h-auto">
                <div className="self-stretch flex-1 rounded-[10px] overflow-hidden flex items-start p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-[rgba(236,234,254,0.27)] flex items-center justify-center">
                      <img src="/Header-Icon.svg" alt="" />
                    </div>
                    <div className="flex items-center">
                      <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                        Enter project description..
                      </div>
                    </div>
                  </div>
                </div>
                <div className="self-stretch rounded-[10px] overflow-hidden flex items-center p-3 gap-2 mq450:flex-wrap mq450:justify-center">
                  <div className="h-6 flex items-center justify-center py-2.5 px-[9px] box-border w-6">
                    <img
                      className="h-[9px] w-1.5 relative shrink-0"
                      alt=""
                      src="/Divider-Icons.svg"
                    />
                  </div>
                  <div className="h-6 flex items-center justify-center py-2.5 px-[9px] box-border w-6">
                    <img
                      className="h-[9px] w-1.5 relative shrink-0"
                      alt=""
                      src="/Vector.svg"
                    />
                  </div>
                  <div className="h-6 flex items-center justify-center py-2.5 px-[9px] box-border w-6">
                    <img
                      className="h-2 w-1.5 relative shrink-0"
                      alt=""
                      src="/Vector1.svg"
                    />
                  </div>
                  <div className="h-6 rounded-lg flex items-center justify-center py-2.5 px-2 box-border w-6">
                    <img
                      className="h-2 w-2 relative shrink-0"
                      alt=""
                      src="/Vector2.svg"
                    />
                  </div>
                  <div className="h-[13px] w-px relative border-[#6b7280] border-solid border-r-[1px] box-border" />
                  <div className="h-6 flex flex-col items-center justify-center py-2.5 px-1.5 box-border w-6">
                    <img
                      className="w-3 h-2 relative shrink-0"
                      alt=""
                      src="/Vector3.svg"
                    />
                  </div>
                  <div className="h-6 flex flex-col items-center justify-center py-2.5 px-1.5 box-border w-6">
                    <img
                      className="w-3 h-2 relative shrink-0"
                      alt=""
                      src="/Vector3.svg"
                    />
                  </div>
                  <div className="h-[13px] w-px relative border-[#6b7280] border-solid border-r-[1px] box-border" />
                  <div className="h-6 rounded-lg flex items-center justify-center py-2.5 px-2 box-border w-6">
                    <img
                      className="h-2 w-2 relative shrink-0"
                      alt=""
                      src="/Vector4.svg"
                    />
                  </div>
                  <div className="h-6 flex flex-col items-center justify-center py-2.5 px-1.5 box-border w-6">
                    <img
                      className="w-3 h-2 relative shrink-0"
                      alt=""
                      src="/Vector5.svg"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="self-stretch flex items-start p-2.5 gap-5 mq675:flex-wrap">
            <div className="flex-1 flex flex-col items-start gap-2.5 min-w-[169px]">
              <div className="flex items-center">
                <div className="relative text-sm font-semibold font-[Inter] text-[#374151] text-left">
                  Category (Optional)
                </div>
              </div>
              <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center justify-between py-2.5 px-3 gap-5">
                <div className="flex items-center">
                  <div className="flex items-center">
                    <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                      Web Development
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start justify-center py-2 px-1.5 box-border w-[px] h-[px]">
                  <img
                    className="w-2 h-1 relative"
                    alt=""
                    src="/Category-Selection-Icon.svg"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-start gap-2.5 min-w-[169px]">
              <div className="flex items-center">
                <div className="relative text-sm font-semibold font-[Inter] text-[#374151] text-left">
                  Project Goals
                </div>
              </div>
              <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center p-3">
                <input
                  className="w-full [border:none] [outline:none] bg-[transparent] h-[17px] flex items-center font-[Inter] font-medium text-sm text-[#6b7280] min-w-[77px]"
                  placeholder="Enter Project Goals"
                  type="text"
                />
              </div>
              <div className="self-stretch h-11 flex items-center justify-center">
                <div className="h-11 flex-1 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden flex items-center justify-between p-3 gap-5 max-w-full">
                  <input
                    className="w-[calc(100%_-_38px)] [border:none] [outline:none] bg-[transparent] h-[15px] flex items-center font-[Inter] text-xs text-[#6b7280] min-w-[103px]"
                    placeholder="Ensure mobile responsiveness"
                    type="text"
                  />
                  <img
                    className="h-3.5 w-3.5 relative"
                    alt=""
                    src="/Goal-Icon.svg"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="self-stretch flex items-start p-2.5 gap-5 mq675:flex-wrap">
            <div className="flex-1 flex flex-col items-start gap-2.5 min-w-[169px]">
              <div className="flex items-center">
                <div className="relative text-sm font-semibold font-[Inter] text-[#374151] text-left">
                  Team (Optional)
                </div>
              </div>
              <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center justify-between py-2.5 px-3 gap-5">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-8 w-[33px] rounded-lg bg-[rgba(236,234,254,0.27)] flex items-center justify-center">
                    <div className="h-8 w-8 rounded-lg bg-[rgba(236,234,254,0.27)] flex items-center justify-center">
                      <img src="/Header-Icon.svg" alt="" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                      Select team
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start justify-center py-2 px-1.5 box-border w-[px] h-[px] shrink-0">
                  <img
                    className="w-2 h-1 relative"
                    alt=""
                    src="/Category-Selection-Icon.svg"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-start gap-2.5 min-w-[169px]">
              <div className="flex items-center">
                <div className="relative text-sm font-semibold font-[Inter] text-[#374151] text-left">
                  Team Members
                </div>
              </div>
              <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center justify-between py-2.5 px-3 gap-5">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-8 w-8 rounded-lg bg-[rgba(236,234,254,0.27)] flex items-center justify-center">
                    <img src="/Header-Icon.svg" alt="" />
                  </div>
                  <div className="flex items-center">
                    <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                      Select user(s)
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start justify-center py-2 px-1.5 box-border w-[px] h-[px] shrink-0">
                  <img
                    className="w-2 h-1 relative"
                    alt=""
                    src="/Category-Selection-Icon.svg"
                  />
                </div>
              </div>
              <div className="flex items-center">
                <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                  Hold Ctrl/Cmd to select multiple
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="self-stretch flex-1 flex flex-col items-start gap-5 min-w-[248px]">
          <FormHeaders status1="Status" toDo="To Do" />
          <FormHeaders
            status1="Priority"
            toDo="Medium"
            statusIndicatorsBackgroundColor="#f59e0b"
          />
          <div className="self-stretch rounded-[10px] border-[#e5e7eb] border-solid border-[1px] flex flex-col items-start justify-center">
            <div className="flex items-center justify-center py-2.5 px-[9px] gap-2.5">
              <div className="flex items-center p-1 box-border w-[px] h-[px]">
                <img className="h-3 w-2.5 relative" alt="" src="/Vector6.svg" />
              </div>
              <div className="relative text-sm font-semibold font-[Inter] text-[#374151] text-left">
                Deadlines
              </div>
            </div>
            <div className="self-stretch flex items-center justify-between gap-0 [row-gap:20px] mq450:flex-wrap mq450:justify-center">
              <div className="flex-1 flex flex-col items-start p-2.5 box-border gap-2.5 min-w-[124px]">
                <div className="flex items-center">
                  <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                    Phase
                  </div>
                </div>
                <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center justify-between py-2.5 px-3 gap-5">
                  <div className="flex items-center">
                    <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                      Add Phase
                    </div>
                  </div>
                  <div className="flex flex-col items-start justify-center py-2 px-1.5 box-border w-[px] h-[px]">
                    <img
                      className="w-2 h-1 relative"
                      alt=""
                      src="/Category-Selection-Icon.svg"
                    />
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-start p-2.5 box-border gap-2.5 min-w-[124px]">
                <div className="flex items-center">
                  <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                    Due Date
                  </div>
                </div>
                <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center py-2.5 px-3 gap-2">
                  <div className="flex items-center p-1 box-border w-[px] h-[px]">
                    <img
                      className="h-3 w-2.5 relative"
                      alt=""
                      src="/Vector6.svg"
                    />
                  </div>
                  <div className="flex items-center">
                    <div className="relative text-sm font-medium font-[Inter] text-[#6b7280] text-left">
                      Select Date
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="self-stretch flex items-center justify-center">
              <div className="flex-1 flex flex-col items-start p-2.5 box-border max-w-full">
                <div className="self-stretch h-11 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center justify-center py-2.5 px-[11px] gap-2 mq450:h-auto mq450:flex-wrap">
                  <img
                    className="h-3.5 w-3.5 relative shrink-0"
                    alt=""
                    src="/Goal-Icon.svg"
                  />
                  <div className="h-[34px] flex-1 flex items-center justify-between py-[7px] px-0 box-border gap-5 min-w-[196px] shrink-0 mq450:h-auto mq450:flex-wrap mq450:gap-5">
                    <div className="w-[116px] flex items-center">
                      <div className="relative text-xs tracking-[-0.02em] leading-5 font-medium font-[Inter] text-[#6b7280] text-left">
                        Design Phase
                      </div>
                    </div>
                    <input
                      className="w-[calc(100%_-_14px)] [border:none] [outline:none] bg-[transparent] h-5 flex items-center font-[Inter] font-medium text-[10px] text-[#6b7280]"
                      placeholder="24 May, 2026"
                      type="text"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="self-stretch rounded-[10px] bg-[#fff] border-[#e5e7eb] border-solid border-[1px] flex flex-col items-center py-2 px-[9px] gap-2.5">
            <div className="self-stretch flex items-start flex-wrap content-start">
              <div className="flex-1 rounded-[10px] flex flex-col items-start justify-center gap-3">
                <div className="flex items-center">
                  <div className="relative text-sm font-semibold font-[Inter] text-[#374151] text-left">
                    Attachments
                  </div>
                </div>
                <div className="w-full h-[122px] rounded-[10px] border-[#e5e7eb] border-dashed border-[2px] box-border overflow-hidden shrink-0 flex items-center justify-center p-3">
                  <div className="flex items-center py-5 px-0 gap-2">
                    <div className="h-10 rounded-3xl bg-[#eceafe] flex flex-col items-center justify-center py-2.5 px-[9px] box-border w-10">
                      <img
                        className="w-[22px] h-3.5 relative"
                        alt=""
                        src="/Upload-Icon.svg"
                      />
                    </div>
                    <div className="relative text-xs tracking-[-0.02em] leading-5 font-medium font-[Inter] text-left">
                      <span className="text-[#6b7280]">
                        {`Drag & drop files here`}
                        <br />
                        {`or `}
                      </span>
                      <span className="text-[#5b5fef]">browse</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="self-stretch flex items-center justify-center gap-2">
              <div className="h-px flex-1 relative border-[#6b7280] border-solid border-t-[1px] box-border" />
              <div className="relative text-xs tracking-[-0.02em] leading-5 font-medium font-[Inter] text-[#6b7280] text-left">
                OR
              </div>
              <div className="h-px flex-1 relative border-[#6b7280] border-solid border-t-[1px] box-border" />
            </div>
            <div className="self-stretch flex items-start justify-center gap-2.5 mq450:flex-wrap">
              <div className="flex-1 flex items-start flex-wrap content-start min-w-[180px]">
                <div className="h-10 flex-1 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden flex items-center py-2 px-2.5 gap-1.5">
                  <div className="h-8 rounded-lg flex items-center justify-center py-2.5 px-2 box-border w-8 shrink-0">
                    <img
                      className="h-[15.1px] w-[15.1px] relative shrink-0"
                      alt=""
                      src="/Vector4.svg"
                    />
                  </div>
                  <input
                    className="w-[calc(100%_-_35.1px)] [border:none] [outline:none] bg-[transparent] h-5 flex items-center font-[Inter] font-medium text-xs text-[#6b7280] min-w-[127px] shrink-0"
                    placeholder="Paste link (Drive, Figma, Website, etc.)"
                    type="text"
                  />
                </div>
              </div>
              <button
                className="cursor-pointer border-[#e5e7eb] border-solid border-[1px] py-2.5 px-[11px] bg-[#eceafe] h-10 rounded-[10px] box-border overflow-hidden flex items-center"
                type="submit"
              >
                <div className="flex items-center">
                  <div className="relative text-xs font-semibold font-[Inter] text-[#5051f9] text-left">
                    Add Link
                  </div>
                </div>
              </button>
            </div>
            <div className="self-stretch h-10 rounded-[10px] border-[#e5e7eb] border-solid border-[1px] box-border overflow-hidden shrink-0 flex items-center justify-between py-2 px-2.5 gap-5 mq450:h-auto mq450:flex-wrap mq450:justify-center">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="h-8 rounded-lg bg-[rgba(236,234,254,0.27)] flex items-center justify-center py-2.5 px-2 box-border w-8">
                  <img
                    className="h-[15.1px] w-[15.1px] relative shrink-0"
                    alt=""
                    src="/Vector4.svg"
                  />
                </div>
                <div className="flex items-center">
                  <div className="relative text-xs tracking-[-0.02em] leading-5 font-medium font-[Inter] text-[#6b7280] text-left">
                    https://www.figma.com/file/abc123...
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="h-6 flex items-center justify-center py-2.5 px-1.5 box-border w-6">
                  <img
                    className="h-[11px] w-[11px] relative shrink-0"
                    alt=""
                    src="/Vector7.svg"
                  />
                </div>
                <div className="h-6 flex items-center justify-center py-2.5 px-[7px] box-border w-6">
                  <img
                    className="h-2.5 w-2.5 relative shrink-0"
                    alt=""
                    src="/Close-Icon.svg"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <div className="self-stretch rounded-xl border-[#e5e7eb] border-solid border-t-[1px] flex items-center justify-end pt-3.5 px-5 pb-4 mq450:gap-[68px]">
        <div className="flex items-center gap-2">
          <button
            className="cursor-pointer border-[#e5e7eb] border-solid border-[1px] py-2.5 px-[11px] bg-[transparent] h-10 rounded-[10px] box-border overflow-hidden flex items-center"
            type="submit"
          >
            <div className="flex items-center">
              <div className="relative text-sm font-medium font-[Inter] text-[#374151] text-left">
                Cancel
              </div>
            </div>
          </button>
          <button
            className="cursor-pointer [border:none] py-[11px] px-4 bg-[#4f46e5] h-10 rounded-[10px] flex items-center box-border gap-2"
            type="submit"
          >
            <div className="flex items-center w-[px] h-[px]">
              <img className="h-3 w-3 relative" alt="" src="/Header-Icon.svg" />
            </div>
            <div className="flex items-center">
              <div className="relative text-sm font-medium font-[Inter] text-[#fff] text-left">
                Create Task
              </div>
            </div>
          </button>
        </div>
      </div>
    </form>
  );
};

CreateNewTask.propTypes = {
  className: PropTypes.string,
};

export default CreateNewTask;
